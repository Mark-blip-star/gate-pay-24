import { Controller, Post, Req, Res, Headers, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { getRateToEur } from '../transactions/currency.util';
import { CALLBACK_QUEUE_NAME } from '../callback-queue/callback-queue.processor';
import type { CallbackJobPayload } from '../callback-queue/callback-job.payload';
import Stripe from 'stripe';

function callbackHost(callbackUrl: string): string {
  try {
    return new URL(callbackUrl).hostname;
  } catch {
    return '(invalid url)';
  }
}

@Controller('stripe')
export class StripeController {
  private readonly logger = new Logger(StripeController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
    @InjectQueue(CALLBACK_QUEUE_NAME)
    private readonly callbackQueue: Queue<CallbackJobPayload>,
  ) {}

  /**
   * Webhook endpoint for Stripe events
   * Handles payment_intent.succeeded, payment_intent.payment_failed, etc.
   */
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string,
  ) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return res.status(400).send('Webhook secret not configured');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      return res.status(400).send('Webhook Error: Missing raw body');
    }

    let event: Stripe.Event;

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.warn(
        `Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown'}`,
      );
      return res
        .status(400)
        .send(
          `Webhook Error: ${err instanceof Error ? err.message : 'Unknown'}`,
        );
    }

    this.logger.log(
      `Stripe webhook received: type=${event.type} id=${event.id}`,
    );

    // Handle the event (idempotent: each event.id processed at most once)
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        const resolvedPaymentType =
          (await this.stripeService.getPaymentMethodWalletType(
            paymentIntent.id,
          )) ??
          paymentIntent.metadata?.paymentType ??
          null;

        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.processedStripeEvent.create({
              data: { eventId: event.id },
            });
            const existing = await tx.payment.findFirst({
              where: { stripePaymentIntentId: paymentIntent.id },
            });
            if (existing) {
              await tx.payment.update({
                where: { id: existing.id },
                data: {
                  status: 'completed',
                  desc: paymentIntent.metadata?.desc ?? existing.desc,
                  paymentType: resolvedPaymentType ?? existing.paymentType,
                },
              });
            } else {
              const publicKey = paymentIntent.metadata?.public_key;
              if (!publicKey) {
                this.logger.warn(
                  'payment_intent.succeeded: missing metadata.public_key',
                );
                throw new Error('missing metadata.public_key');
              }
              const user = await tx.user.findUnique({
                where: { publicKey },
              });
              if (!user) {
                this.logger.warn(
                  'payment_intent.succeeded: no user for public_key',
                );
                throw new Error('no user for public_key');
              }
              const amountCents = paymentIntent.amount ?? 0;
              const amountDecimal = amountCents / 100;
              await tx.payment.create({
                data: {
                  userId: user.id,
                  stripePaymentIntentId: paymentIntent.id,
                  amount: amountDecimal,
                  currency: paymentIntent.currency ?? 'eur',
                  status: 'completed',
                  payAccount: paymentIntent.metadata?.account ?? null,
                  ordernum: paymentIntent.metadata?.ordernum ?? null,
                  desc: paymentIntent.metadata?.desc ?? null,
                  paymentType: resolvedPaymentType ?? null,
                },
              });
            }
          });
        } catch (err: unknown) {
          const code =
            err && typeof err === 'object' && 'code' in err
              ? (err as { code: string }).code
              : undefined;
          if (code === 'P2002') {
            this.logger.log(
              `Stripe event already processed (idempotent skip): id=${event.id}`,
            );
            return res.status(200).json({ received: true });
          }
          throw err;
        }

        this.logger.log(
          `Payment intent succeeded processed: pi=${paymentIntent.id} type=${resolvedPaymentType ?? 'n/a'}`,
        );

        // Notify partner: PAY callback (via queue with retries; fallback to immediate fetch if Redis down)
        const paymentWithUser = await this.prisma.payment.findFirst({
          where: { stripePaymentIntentId: paymentIntent.id },
          include: { user: { include: { userSettings: true } } },
        });
        const callbackUrl =
          paymentWithUser?.user?.userSettings?.callbackUrl?.trim() || '';
        if (callbackUrl) {
          const amount = Number(paymentWithUser?.amount ?? 0);
          const currency = (paymentWithUser?.currency ?? 'EUR').toUpperCase();
          const revenueEur = amount * getRateToEur(currency);
          const payParams: Record<string, string> = {
            method: 'pay',
            'params[account]': paymentWithUser?.payAccount ?? '',
            'params[projectId]': paymentWithUser?.projectId ?? '',
            'params[sum]': String(paymentWithUser?.sum ?? amount),
            'params[amount]': amount.toFixed(2),
            'params[currency]': currency,
            'params[localpayId]': paymentWithUser?.id ?? '',
            'params[paymentType]': paymentWithUser?.paymentType ?? 'card',
            'params[revenue]': revenueEur.toFixed(2),
            'params[desc]': paymentWithUser?.desc ?? '',
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
              `Callback queued: method=pay paymentId=${paymentWithUser?.id} host=${callbackHost(callbackUrl)}`,
            );
          } catch {
            this.logger.log(
              `Callback queue unavailable, sending immediately: method=pay paymentId=${paymentWithUser?.id} host=${callbackHost(callbackUrl)}`,
            );
            const query = new URLSearchParams(payFiltered).toString();
            const callbackFullUrl =
              (callbackUrl.includes('?')
                ? callbackUrl + '&'
                : callbackUrl + '?') + query;
            fetch(callbackFullUrl, {
              method: 'GET',
              headers: { Accept: 'application/json' },
            }).catch(() => {});
          }
        }

        break;
      }

      case 'payment_intent.payment_failed': {
        const failedPayment = event.data.object;
        const resolvedPaymentType =
          (await this.stripeService.getPaymentMethodWalletType(
            failedPayment.id,
          )) ??
          failedPayment.metadata?.paymentType ??
          null;

        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.processedStripeEvent.create({
              data: { eventId: event.id },
            });
            const existingFailed = await tx.payment.findFirst({
              where: { stripePaymentIntentId: failedPayment.id },
            });
            if (existingFailed) {
              await tx.payment.update({
                where: { id: existingFailed.id },
                data: {
                  status: 'failed',
                  desc: failedPayment.metadata?.desc ?? existingFailed.desc,
                  paymentType:
                    resolvedPaymentType ?? existingFailed.paymentType,
                },
              });
            } else {
              const publicKey = failedPayment.metadata?.public_key;
              if (publicKey) {
                const user = await tx.user.findUnique({
                  where: { publicKey },
                });
                if (user) {
                  const amountCents = failedPayment.amount ?? 0;
                  const amountDecimal = amountCents / 100;
                  await tx.payment.create({
                    data: {
                      userId: user.id,
                      stripePaymentIntentId: failedPayment.id,
                      amount: amountDecimal,
                      currency: failedPayment.currency ?? 'eur',
                      status: 'failed',
                      payAccount: failedPayment.metadata?.account ?? null,
                      ordernum: failedPayment.metadata?.ordernum ?? null,
                      desc: failedPayment.metadata?.desc ?? null,
                      paymentType: resolvedPaymentType ?? null,
                    },
                  });
                }
              }
            }
          });
        } catch (err: unknown) {
          const code =
            err && typeof err === 'object' && 'code' in err
              ? (err as { code: string }).code
              : undefined;
          if (code === 'P2002') {
            this.logger.log(
              `Stripe event already processed (idempotent skip): id=${event.id}`,
            );
            return res.status(200).json({ received: true });
          }
          throw err;
        }

        this.logger.log(
          `Payment intent failed processed: pi=${failedPayment.id}`,
        );

        // Notify partner: ERROR callback (payment failed)
        const failedWithUser = await this.prisma.payment.findFirst({
          where: { stripePaymentIntentId: failedPayment.id },
          include: { user: { include: { userSettings: true } } },
        });
        const errorCallbackUrl =
          failedWithUser?.user?.userSettings?.callbackUrl?.trim() || '';
        if (errorCallbackUrl) {
          const amount = Number(failedWithUser?.amount ?? 0);
          const currency = (failedWithUser?.currency ?? 'EUR').toUpperCase();
          const revenueEur = amount * getRateToEur(currency);
          const errorParams: Record<string, string> = {
            method: 'error',
            'params[account]': failedWithUser?.payAccount ?? '',
            'params[projectId]': failedWithUser?.projectId ?? '',
            'params[sum]': String(failedWithUser?.sum ?? amount),
            'params[amount]': amount.toFixed(2),
            'params[currency]': currency,
            'params[localpayId]': failedWithUser?.id ?? '',
            'params[paymentType]':
              failedWithUser?.paymentType ?? resolvedPaymentType ?? '',
            'params[revenue]': revenueEur.toFixed(2),
            'params[desc]': failedWithUser?.desc ?? '',
          };
          const errorFiltered = Object.fromEntries(
            Object.entries(errorParams).filter(
              ([, v]) => v != null && String(v).trim() !== '',
            ),
          );
          try {
            await this.callbackQueue.add('send', {
              method: 'error',
              callbackUrl: errorCallbackUrl,
              params: errorFiltered,
            });
            this.logger.log(
              `Callback queued: method=error paymentId=${failedWithUser?.id} host=${callbackHost(errorCallbackUrl)}`,
            );
          } catch {
            this.logger.log(
              `Callback queue unavailable, sending immediately: method=error paymentId=${failedWithUser?.id} host=${callbackHost(errorCallbackUrl)}`,
            );
            const errorQuery = new URLSearchParams(errorFiltered).toString();
            const errorFullUrl =
              (errorCallbackUrl.includes('?')
                ? errorCallbackUrl + '&'
                : errorCallbackUrl + '?') + errorQuery;
            fetch(errorFullUrl, {
              method: 'GET',
              headers: { Accept: 'application/json' },
            }).catch(() => {});
          }
        }

        break;
      }

      case 'payment_intent.canceled': {
        const canceledPayment = event.data.object;
        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.processedStripeEvent.create({
              data: { eventId: event.id },
            });
            await tx.payment.updateMany({
              where: {
                stripePaymentIntentId: canceledPayment.id,
                status: 'pending',
              },
              data: { status: 'canceled' },
            });
          });
        } catch (err: unknown) {
          const code =
            err && typeof err === 'object' && 'code' in err
              ? (err as { code: string }).code
              : undefined;
          if (code === 'P2002') {
            this.logger.log(
              `Stripe event already processed (idempotent skip): id=${event.id}`,
            );
            return res.status(200).json({ received: true });
          }
          throw err;
        }
        this.logger.log(
          `Payment intent canceled processed: pi=${canceledPayment.id}`,
        );
        break;
      }

      default:
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
    }

    res.json({ received: true });
  }
}
