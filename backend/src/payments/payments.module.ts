import { Module } from '@nestjs/common';
import { CallbackQueueModule } from '../callback-queue/callback-queue.module';
import { PaymentsController } from './payments.controller';
import { PendingPaymentsExpireService } from './pending-payments-expire.service';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [CallbackQueueModule, StripeModule],
  controllers: [PaymentsController],
  providers: [PendingPaymentsExpireService],
})
export class PaymentsModule {}
