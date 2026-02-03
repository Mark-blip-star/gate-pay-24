import { Module } from '@nestjs/common';
import { CallbackQueueModule } from '../callback-queue/callback-queue.module';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';

@Module({
  imports: [CallbackQueueModule],
  providers: [StripeService],
  controllers: [StripeController],
  exports: [StripeService],
})
export class StripeModule {}
