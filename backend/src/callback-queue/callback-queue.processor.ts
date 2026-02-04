import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CallbackJobPayload } from './callback-job.payload';

export const CALLBACK_QUEUE_NAME = 'callback';

function callbackHost(callbackUrl: string): string {
  try {
    return new URL(callbackUrl).hostname;
  } catch {
    return '(invalid url)';
  }
}

/**
 * Sends GET request to partner callback URL with params.
 * On non-2xx or network error throws so BullMQ retries with backoff.
 */
@Processor(CALLBACK_QUEUE_NAME)
export class CallbackQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(CallbackQueueProcessor.name);

  async process(job: Job<CallbackJobPayload>): Promise<void> {
    const { callbackUrl, params, method } = job.data;
    const host = callbackHost(callbackUrl);
    this.logger.log(
      `Callback job started: jobId=${job.id} method=${method} host=${host} attempt=${job.attemptsMade + 1}`,
    );

    const query = new URLSearchParams(params).toString();
    const url =
      (callbackUrl.includes('?') ? callbackUrl + '&' : callbackUrl + '?') +
      query;

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      this.logger.warn(
        `Callback job failed (will retry): jobId=${job.id} method=${method} host=${host} status=${res.status}`,
      );
      throw new Error(
        `Callback ${method} failed: ${res.status} ${res.statusText}`,
      );
    }

    this.logger.log(
      `Callback delivered: jobId=${job.id} method=${method} host=${host} status=${res.status}`,
    );
  }
}
