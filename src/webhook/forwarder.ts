/**
 * Webhook forwarder — re-POST a captured/raw PayWay callback to a local app
 * (P0 W-1 of docs/strategy/competitive-analysis-cli-stripe-razorpay.md).
 *
 * The forwarder is the Stripe `listen --forward-to` analog for PayWay: the
 * capture server (`setup-webhook`) keeps its capture/store/journal contract
 * unchanged, and additionally re-delivers every accepted callback to a
 * developer's local receiver URL so the local dev loop works without the ABA
 * Simulator.
 *
 * Design rules (pinned by webhook-forwarder.test.ts):
 * - Delivery failures never break capture: the original request still gets
 *   its 200 acknowledge. Failures are logged + counted, surfaced at shutdown.
 * - Only one in-flight forward per callback; no retry queue (this is a dev
 *   tool, not a production queue).
 * - Forwarded headers: content-type from the original request + the original
 *   HMAC signature header (so the receiver can verify) + optional custom
 *   headers (`--forward-headers "Key:Value, Key2:Value2"`).
 */

import type { IncomingMessage } from 'node:http';

export interface WebhookForwarderOptions {
  /** Target application URL that receives forwarded callbacks. */
  url: string;
  /**
   * Extra headers to attach to every forwarded delivery.
   * Parsed from the `"Key1:Value1, Key2:Value2"` CLI shape.
   */
  headers?: Record<string, string>;
  /** Suppress console output. */
  quiet?: boolean;
  /** Fetch implementation seam (tests inject a spy; default global fetch). */
  fetchImpl?: typeof fetch;
  /** Log sink (default console.log; the CLI injects its own styled logger). */
  log?: (line: string) => void;
}

export interface ForwardOutcome {
  /** Whether the receiver answered 2xx. */
  ok: boolean;
  /** Receiver HTTP status when it answered. */
  status?: number;
  /** Failure description when the delivery did not reach a receiver. */
  error?: string;
}

export interface ForwardStats {
  delivered: number;
  failed: number;
}

/** Parse `"Key1:Value1, Key2:Value2"` into a header record. Empty values pass through. */
export function parseForwardHeaders(spec: string | undefined): Record<string, string> {
  if (!spec || spec.trim() === '') return {};
  const headers: Record<string, string> = {};
  for (const pair of spec.split(',')) {
    const idx = pair.indexOf(':');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key === '') continue;
    headers[key] = value;
  }
  return headers;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export class WebhookForwarder {
  readonly url: string;
  private readonly extraHeaders: Record<string, string>;
  private readonly quiet: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly logLine: (line: string) => void;
  private readonly stats: ForwardStats = { delivered: 0, failed: 0 };

  constructor(options: WebhookForwarderOptions) {
    if (!isHttpUrl(options.url)) {
      throw new Error(`forward-to URL must be a valid http(s) URL, received: ${options.url}`);
    }
    this.url = options.url;
    this.extraHeaders = options.headers ?? {};
    this.quiet = options.quiet ?? false;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logLine = options.log ?? ((line: string) => console.log(line));
  }

  /** Total deliveries accepted by the receiver vs failed. */
  get statistics(): ForwardStats {
    return { ...this.stats };
  }

  /**
   * Forward one captured callback body. Never throws — capture must survive
   * receiver downtime. Returns the delivery outcome for logging/callers.
   */
  async forward(
    body: string,
    context: { headers?: Record<string, string | string[] | undefined>; sourceRequest?: IncomingMessage; label?: string } = {},
  ): Promise<ForwardOutcome> {
    const label = context.label ?? 'callback';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body)),
      'User-Agent': 'aba-payway-sdk-forwarder/1',
      ...this.extraHeaders,
    };

    // Re-deliver the original HMAC header when present so the receiving app
    // can run its full verifyCallback path — not a blank unsigned delivery.
    const signature = pickHeader(context.headers ?? {}, 'x-payway-hmac-sha512')
      ?? (context.sourceRequest?.headers
        ? pickHeader(context.sourceRequest.headers as Record<string, string | string[] | undefined>, 'x-payway-hmac-sha512')
        : undefined);
    if (signature !== undefined) headers['X-PAYWAY-HMAC-SHA512'] = signature;

    try {
      const response = await this.fetchImpl(this.url, { method: 'POST', headers, body });
      if (response.ok) {
        this.stats.delivered += 1;
        if (!this.quiet) this.logLine(`  → forwarded ${label} to ${this.url} [HTTP ${response.status}]`);
        return { ok: true, status: response.status };
      }
      this.stats.failed += 1;
      if (!this.quiet) this.logLine(`  → forward ${label} to ${this.url} failed [HTTP ${response.status}]`);
      return { ok: false, status: response.status };
    } catch (error) {
      this.stats.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      if (!this.quiet) this.logLine(`  → forward ${label} to ${this.url} failed: ${message}`);
      return { ok: false, error: message };
    }
  }
}

function pickHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && value.length > 0) return value.join(', ');
  return undefined;
}
