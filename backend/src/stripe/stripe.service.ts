import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(secretKey || '');
  }

  /**
   * Create a Payment Intent for card and Express Checkout (wallets).
   * Note: return_url is passed on the client in confirmPayment(confirmParams), not here.
   */
  async createPaymentIntent(
    amount: number,
    currency: string,
    metadata?: Record<string, string>,
  ): Promise<Stripe.PaymentIntent> {
    return await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata: metadata || {},
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }

  /**
   * Create a Payment Intent for Google Pay / Apple Pay
   */
  async createWalletPaymentIntent(
    amount: number,
    currency: string,
    metadata?: Record<string, string>,
  ): Promise<Stripe.PaymentIntent> {
    return await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      metadata: metadata || {},
      payment_method_types: ['card'],
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'always',
      },
    });
  }

  /**
   * Update Payment Intent metadata (e.g. paymentType set by user on client).
   */
  async updatePaymentIntentMetadata(
    paymentIntentId: string,
    metadata: Record<string, string>,
  ): Promise<Stripe.PaymentIntent> {
    return await this.stripe.paymentIntents.update(paymentIntentId, {
      metadata,
    });
  }

  /**
   * Retrieve Payment Intent by ID
   */
  async getPaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    return await this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  /**
   * Confirm Payment Intent
   */
  async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId?: string,
  ): Promise<Stripe.PaymentIntent> {
    return await this.stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });
  }

  /**
   * Get public key for frontend
   */
  getPublicKey(): string {
    return this.configService.get<string>('STRIPE_PUBLIC_KEY') || '';
  }
}
