import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [StripeModule],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
