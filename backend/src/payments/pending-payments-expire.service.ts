import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';

/** Advisory lock id: only one instance runs the expire job at a time */
const EXPIRE_LOCK_ID = 0x65787069; // "expi" in hex
/** Pending payments older than this (minutes) are considered abandoned */
const PENDING_EXPIRE_MINUTES = 30;
/** Max payments to process per cron run */
const BATCH_SIZE = 100;

@Injectable()
export class PendingPaymentsExpireService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Every hour: cancel abandoned pending payments (e.g. user left page).
   * Uses Postgres advisory lock so only one instance runs when scaled.
   */
  @Cron('0 * * * *')
  async expirePendingPayments(): Promise<void> {
    const lockResult = await this.prisma.$queryRaw<
      [{ acquired: boolean }]
    >`SELECT pg_try_advisory_lock(${EXPIRE_LOCK_ID}) as acquired`;

    const acquired = lockResult[0]?.acquired ?? false;
    if (!acquired) {
      return;
    }

    try {
      const cutoff = new Date(Date.now() - PENDING_EXPIRE_MINUTES * 60 * 1000);

      const pending = await this.prisma.payment.findMany({
        where: {
          status: 'pending',
          stripePaymentIntentId: { not: null },
          createdAt: { lt: cutoff },
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
        select: { id: true, stripePaymentIntentId: true },
      });

      for (const row of pending) {
        const piId = row.stripePaymentIntentId;
        if (!piId) continue;

        try {
          await this.stripeService.cancelPaymentIntent(piId);
          await this.prisma.payment.updateMany({
            where: {
              id: row.id,
              status: 'pending',
            },
            data: { status: 'canceled' },
          });
        } catch (err) {
          // Stripe returns error if PI already succeeded/processing — do not overwrite
          const code =
            err && typeof err === 'object' && 'code' in err
              ? (err as { code?: string }).code
              : undefined;
          if (code === 'payment_intent_unexpected_state') {
            // Already succeeded or processing; leave DB as-is, webhook will sync
            continue;
          }
          console.error(
            `[PendingPaymentsExpire] Failed to cancel PI ${piId}:`,
            err,
          );
        }
      }
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${EXPIRE_LOCK_ID})`;
    }
  }
}
