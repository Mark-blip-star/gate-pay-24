import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { CallbackQueueProcessor } from './callback-queue.processor';
import { CALLBACK_QUEUE_NAME } from './callback-queue.processor';

function parseRedisUrl(url: string): {
  host: string;
  port: number;
  password?: string;
  tls?: object;
} {
  const u = new URL(url);
  const port = u.port ? parseInt(u.port, 10) : 6379;
  const opts: { host: string; port: number; password?: string; tls?: object } =
    {
      host: u.hostname,
      port,
    };
  if (u.password) opts.password = decodeURIComponent(u.password);
  if (u.protocol === 'rediss:') opts.tls = {};
  return opts;
}

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL');
        const connection = url
          ? parseRedisUrl(url)
          : { host: 'localhost', port: 6379 };
        return { connection };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: CALLBACK_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 60_000, // 1 min, then 2, 4, 8, 16 min
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    }),
  ],
  providers: [CallbackQueueProcessor],
  exports: [BullModule],
})
export class CallbackQueueModule {}
