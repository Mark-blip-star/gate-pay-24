import { Controller, Post, Req, Res, Headers } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';

@Controller('stripe')
export class StripeController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
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
      console.error('Webhook signature verification failed:', err);
      return res
        .status(400)
        .send(
          `Webhook Error: ${err instanceof Error ? err.message : 'Unknown'}`,
        );
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        const resolvedPaymentType =
          (await this.stripeService.getPaymentMethodWalletType(
            paymentIntent.id,
          )) ?? paymentIntent.metadata?.paymentType ?? null;

        const existing = await this.prisma.payment.findFirst({
          where: { stripePaymentIntentId: paymentIntent.id },
        });
        if (existing) {
          await this.prisma.payment.update({
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
            console.warn(
              'payment_intent.succeeded: missing metadata.public_key',
            );
            break;
          }
          const user = await this.prisma.user.findUnique({
            where: { publicKey },
          });
          if (!user) {
            console.warn(
              'payment_intent.succeeded: no user for public_key',
              publicKey,
            );
            break;
          }
          const amountCents = paymentIntent.amount ?? 0;
          const amountDecimal = amountCents / 100;
          await this.prisma.payment.create({
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
        break;
      }

      case 'payment_intent.payment_failed': {
        const failedPayment = event.data.object;
        const resolvedPaymentType =
          (await this.stripeService.getPaymentMethodWalletType(
            failedPayment.id,
          )) ?? failedPayment.metadata?.paymentType ?? null;

        const existingFailed = await this.prisma.payment.findFirst({
          where: { stripePaymentIntentId: failedPayment.id },
        });
        if (existingFailed) {
          await this.prisma.payment.update({
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
            const user = await this.prisma.user.findUnique({
              where: { publicKey },
            });
            if (user) {
              const amountCents = failedPayment.amount ?? 0;
              const amountDecimal = amountCents / 100;
              await this.prisma.payment.create({
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
        break;
      }

      case 'payment_intent.canceled': {
        const canceledPayment = event.data.object;
        await this.prisma.payment.updateMany({
          where: {
            stripePaymentIntentId: canceledPayment.id,
            status: 'pending',
          },
          data: { status: 'canceled' },
        });
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  }
}
