/**
 * Payload for callback queue job.
 * Partner receives GET request: callbackUrl + '?' + query from params.
 */
export interface CallbackJobPayload {
  /** 'pay' | 'error' */
  method: 'pay' | 'error';
  /** Partner callback URL (base, without query) */
  callbackUrl: string;
  /** Query params as flat object (e.g. { method: 'pay', 'params[account]': '...' }) */
  params: Record<string, string>;
}
