import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { CALLBACK_QUEUE_NAME } from '../callback-queue/callback-queue.processor';
import type { CallbackJobPayload } from '../callback-queue/callback-job.payload';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { getRateToEur } from '../transactions/currency.util';

function callbackHost(callbackUrl: string): string {
  try {
    return new URL(callbackUrl).hostname;
  } catch {
    return '(invalid url)';
  }
}

/** Advisory lock id: only one instance runs the expire job at a time */
const EXPIRE_LOCK_ID = 0x65787069; // "expi" in hex
/** Pending payments older than this (minutes) are considered abandoned for cancel */
const PENDING_EXPIRE_MINUTES = 30;
/** Max payments to process per cron run */
const BATCH_SIZE = 100;

@Injectable()
export class PendingPaymentsExpireService {
  private readonly logger = new Logger(PendingPaymentsExpireService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    @InjectQueue(CALLBACK_QUEUE_NAME)
    private readonly callbackQueue: Queue<CallbackJobPayload>,
  ) {}

  /**
   * Every 10 minutes: sync pending payments with Stripe, then expire old ones.
   * 1) Retrieve each pending payment's PI from Stripe.
   * 2) If Stripe says succeeded → update to completed and send PAY callback.
   * 3) If Stripe says canceled → update to canceled.
   * 4) If still in progress and older than 30 min → cancel in Stripe and set canceled.
   * Uses Postgres advisory lock so only one instance runs when scaled.
   */
  @Cron('*/10 * * * *')
  async expirePendingPayments(): Promise<void> {
    const lockResult = await this.prisma.$queryRaw<
      [{ acquired: boolean }]
    >`SELECT pg_try_advisory_lock(${EXPIRE_LOCK_ID}) as acquired`;

    const acquired = lockResult[0]?.acquired ?? false;
    if (!acquired) {
      return;
    }

    this.logger.log('Pending payments sync/expire job started (lock acquired)');

    const cutoff = new Date(Date.now() - PENDING_EXPIRE_MINUTES * 60 * 1000);

    try {
      const pending = await this.prisma.payment.findMany({
        where: {
          status: 'pending',
          stripePaymentIntentId: { not: null },
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
        include: { user: { include: { userSettings: true } } },
      });

      for (const row of pending) {
        const piId = row.stripePaymentIntentId;
        if (!piId) continue;

        let pi: Awaited<ReturnType<StripeService['getPaymentIntent']>>;
        try {
          pi = await this.stripeService.getPaymentIntent(piId);
        } catch (err) {
          this.logger.warn(
            `Failed to retrieve PI from Stripe: pi=${piId} error=${err instanceof Error ? err.message : 'Unknown'}`,
          );
          continue;
        }

        const status = pi.status;

        if (status === 'succeeded') {
          this.logger.log(
            `Stripe sync: payment ${row.id} pi=${piId} status=succeeded → completed`,
          );
          const resolvedPaymentType =
            (await this.stripeService.getPaymentMethodWalletType(piId)) ??
            pi.metadata?.paymentType ??
            null;
          await this.prisma.payment.update({
            where: { id: row.id },
            data: {
              status: 'completed',
              desc: pi.metadata?.desc ?? row.desc,
              paymentType: resolvedPaymentType ?? row.paymentType,
            },
          });
          await this.sendPayCallback(
            row,
            resolvedPaymentType ?? row.paymentType,
          );
          continue;
        }

        if (status === 'canceled') {
          this.logger.log(
            `Stripe sync: payment ${row.id} pi=${piId} status=canceled`,
          );
          await this.prisma.payment.updateMany({
            where: { id: row.id, status: 'pending' },
            data: { status: 'canceled' },
          });
          continue;
        }

        // Still in progress (requires_payment_method, requires_confirmation, etc.)
        if (row.createdAt >= cutoff) {
          continue;
        }
        this.logger.log(
          `Stripe sync: payment ${row.id} pi=${piId} expired (old) → canceling`,
        );
        try {
          await this.stripeService.cancelPaymentIntent(piId);
          await this.prisma.payment.updateMany({
            where: { id: row.id, status: 'pending' },
            data: { status: 'canceled' },
          });
        } catch (err) {
          const code =
            err && typeof err === 'object' && 'code' in err
              ? (err as { code?: string }).code
              : undefined;
          if (code === 'payment_intent_unexpected_state') {
            continue;
          }
          this.logger.warn(
            `Failed to cancel PI: pi=${piId} error=${err instanceof Error ? err.message : 'Unknown'}`,
          );
        }
      }
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${EXPIRE_LOCK_ID})`;
    }
  }

  /**
   * Notify partner: PAY callback (via queue with retries; fallback to immediate fetch if Redis down).
   * Errors are ignored after fallback attempt.
   */
  private async sendPayCallback(
    payment: {
      id: string;
      amount: unknown;
      currency: string;
      payAccount: string | null;
      projectId: string | null;
      sum: string | null;
      desc: string | null;
      user?: {
        userSettings?: { callbackUrl: string | null } | null;
      } | null;
    },
    paymentType: string,
  ): Promise<void> {
    const callbackUrl = payment.user?.userSettings?.callbackUrl?.trim() || '';
    if (!callbackUrl) return;

    const amount = Number(payment.amount ?? 0);
    const currency = (payment.currency ?? 'EUR').toUpperCase();
    const revenueEur = amount * getRateToEur(currency);
    const payParams: Record<string, string> = {
      method: 'pay',
      'params[account]': payment.payAccount ?? '',
      'params[projectId]': payment.projectId ?? '',
      'params[sum]': String(payment.sum ?? amount),
      'params[amount]': amount.toFixed(2),
      'params[currency]': currency,
      'params[localpayId]': payment.id,
      'params[paymentType]': paymentType,
      'params[revenue]': revenueEur.toFixed(2),
      'params[desc]': payment.desc ?? '',
    };
    const payFiltered = Object.fromEntries(
      Object.entries(payParams).filter(
        ([, v]) => v != null && String(v).trim() !== '',
      ),
    );
    try {
      await this.callbackQueue.add('send', {
        method: 'pay',
        callbackUrl,
        params: payFiltered,
      });
      this.logger.log(
        `Callback queued (cron): method=pay paymentId=${payment.id} host=${callbackHost(callbackUrl)}`,
      );
    } catch {
      this.logger.log(
        `Callback queue unavailable (cron), sending immediately: method=pay paymentId=${payment.id} host=${callbackHost(callbackUrl)}`,
      );
      const query = new URLSearchParams(payFiltered).toString();
      const callbackFullUrl =
        (callbackUrl.includes('?') ? callbackUrl + '&' : callbackUrl + '?') +
        query;
      fetch(callbackFullUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }).catch(() => {});
    }
  }
}
