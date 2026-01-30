import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PendingPaymentsExpireService } from './pending-payments-expire.service';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [StripeModule],
  controllers: [PaymentsController],
  providers: [PendingPaymentsExpireService],
})
export class PaymentsModule {}
