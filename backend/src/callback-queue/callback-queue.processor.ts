import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CallbackJobPayload } from './callback-job.payload';

export const CALLBACK_QUEUE_NAME = 'callback';

/**
 * Sends GET request to partner callback URL with params.
 * On non-2xx or network error throws so BullMQ retries with backoff.
 */
@Processor(CALLBACK_QUEUE_NAME)
export class CallbackQueueProcessor extends WorkerHost {
  async process(job: Job<CallbackJobPayload>): Promise<void> {
    const { callbackUrl, params } = job.data;
    const query = new URLSearchParams(params).toString();
    const url =
      (callbackUrl.includes('?') ? callbackUrl + '&' : callbackUrl + '?') +
      query;

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(
        `Callback ${job.data.method} failed: ${res.status} ${res.statusText}`,
      );
    }
  }
}
