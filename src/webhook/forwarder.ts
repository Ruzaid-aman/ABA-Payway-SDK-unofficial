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
 * Design rules (pinned by webhook-forwarder.test.ts and
 * webhook-forward-queue.test.ts):
 * - Delivery failures never break capture: the original request still gets
 *   its 200 acknowledge. Failures are logged + counted, surfaced at shutdown.
 * - The callback ACK never waits on forwarding (audit WP03): capture dispatches
 *   through WebhookForwardQueue, which ACKs by returning immediately and
 *   drains in the background — a hung or slow receiver can never delay the
 *   upstream acknowledgement past the capture work itself.
 * - Every forward is bounded by a timeout (AbortSignal) — no unbounded
 *   in-flight delivery can pin the queue forever.
 * - The queue is bounded: when saturated, the FORWARD is dropped (never the
 *   capture) and the drop is counted + logged — the capture record remains
 *   on disk for `webhook resend`.
 * - Only one in-flight forward per queue; no retry queue (this is a dev
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
  /**
   * Per-delivery timeout in milliseconds (audit WP03: a receiver that never
   * answers must not hold a queue slot or the caller forever). The fetch is
   * aborted when the budget elapses. Default: 5000.
   */
  timeoutMs?: number;
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
  /** Deliveries aborted because the receiver exceeded the timeout budget. */
  timedOut: number;
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
  private readonly timeoutMs: number;
  private readonly stats: ForwardStats = { delivered: 0, failed: 0, timedOut: 0 };

  constructor(options: WebhookForwarderOptions) {
    if (!isHttpUrl(options.url)) {
      throw new Error(`forward-to URL must be a valid http(s) URL, received: ${options.url}`);
    }
    this.url = options.url;
    this.extraHeaders = options.headers ?? {};
    this.quiet = options.quiet ?? false;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logLine = options.log ?? ((line: string) => console.log(line));
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  /** Total deliveries accepted by the receiver vs failed/aborted. */
  get statistics(): ForwardStats {
    return { ...this.stats };
  }

  /**
   * Forward one captured callback body. Never throws — capture must survive
   * receiver downtime. Bounded by the timeout budget (audit WP03). Returns
   * the delivery outcome for logging/callers.
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
      const response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
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
      if (error instanceof Error && error.name === 'TimeoutError') {
        this.stats.timedOut += 1;
        this.stats.failed -= 1;
        if (!this.quiet) this.logLine(`  → forward ${label} to ${this.url} aborted after ${this.timeoutMs}ms (receiver too slow)`);
        return { ok: false, error: `timeout after ${this.timeoutMs}ms` };
      }
      const message = error instanceof Error ? error.message : String(error);
      if (!this.quiet) this.logLine(`  → forward ${label} to ${this.url} failed: ${message}`);
      return { ok: false, error: message };
    }
  }
}

export interface ForwardQueueStats extends ForwardStats {
  /** Deliveries accepted into the queue and handed to the receiver. */
  queued: number;
  /** Deliveries DROPPED because the queue was saturated (capture unaffected). */
  dropped: number;
}

interface QueueItem {
  body: string;
  context: { headers?: Record<string, string | string[] | undefined>; sourceRequest?: IncomingMessage; label?: string };
}

/**
 * Bounded background delivery queue (audit WP03). `enqueue()` never awaits
 * the network: the caller (the capture server's request handler) can ACK
 * immediately after the durable local capture, while deliveries drain
 * in-order in the background. One in-flight delivery at a time keeps
 * per-callback ordering to the dev receiver.
 *
 * The queue is bounded — when `maxQueue` deliveries are already waiting, the
 * FORWARD is dropped (counted + logged) and the capture record stays
 * queryable/resendable. `stop()` awaits the in-flight delivery (bounded by
 * the forwarder's timeout) and reports how many queued deliveries were
 * dropped at shutdown.
 */
export class WebhookForwardQueue {
  private readonly forwarder: WebhookForwarder;
  private readonly maxQueue: number;
  private readonly quiet: boolean;
  private readonly logLine: (line: string) => void;
  private readonly pending: QueueItem[] = [];
  private draining = false;
  private stopped = false;
  private inFlight: Promise<void> = Promise.resolve();
  private readonly stats: ForwardQueueStats = { delivered: 0, failed: 0, timedOut: 0, queued: 0, dropped: 0 };

  constructor(
    forwarder: WebhookForwarder,
    options: { maxQueue?: number; quiet?: boolean; log?: (line: string) => void } = {},
  ) {
    this.forwarder = forwarder;
    this.maxQueue = options.maxQueue ?? 100;
    this.quiet = options.quiet ?? false;
    this.logLine = options.log ?? ((line: string) => console.log(line));
  }

  get statistics(): ForwardQueueStats {
    return { ...this.forwarder.statistics, queued: this.stats.queued, dropped: this.stats.dropped };
  }

  get depth(): number {
    return this.pending.length;
  }

  /**
   * Hand one captured delivery to the background queue. Never awaits the
   * network. Returns false when the queue was saturated and the forward was
   * dropped (the capture itself is always unaffected).
   */
  enqueue(
    body: string,
    context: { headers?: Record<string, string | string[] | undefined>; sourceRequest?: IncomingMessage; label?: string } = {},
  ): boolean {
    if (this.stopped) return false;
    if (this.pending.length >= this.maxQueue) {
      this.stats.dropped += 1;
      if (!this.quiet) {
        this.logLine(
          `  → forward queue saturated (${this.maxQueue} pending) — dropped forward for ${context.label ?? 'callback'} (capture retained; use webhook resend)`,
        );
      }
      return false;
    }
    this.pending.push({ body, context });
    this.stats.queued += 1;
    void this.drain();
    return true;
  }

  /** Signal no-more-enqueues; future enqueue() calls are rejected. */
  stopAccepting(): void {
    this.stopped = true;
  }

  /**
   * Await the in-flight delivery so a shutdown never tears a delivery out
   * from under the socket. Bounded by the forwarder's per-delivery timeout.
   */
  async idle(): Promise<void> {
    await this.inFlight;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    this.inFlight = (async () => {
      try {
        while (this.pending.length > 0) {
          const item = this.pending.shift();
          if (!item) break;
          await this.forwarder.forward(item.body, item.context);
        }
      } finally {
        this.draining = false;
      }
    })();
    await this.inFlight;
  }
}

function pickHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && value.length > 0) return value.join(', ');
  return undefined;
}
