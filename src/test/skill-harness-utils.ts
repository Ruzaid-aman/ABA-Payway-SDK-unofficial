/**
 * Shared seams for executing skill-guide example handlers against fixture
 * callbacks (the R2/F12 behavior harness in skill-handler-behavior.test.ts).
 *
 * The guide code references collaborators by bare name (app, payway, orders,
 * db). A harness supplies deterministic fakes for
 * those names so the guide snippet runs verbatim, and records what the
 * handler did: claims taken, fulfillment jobs queued, HTTP status sent.
 */

/** Express-like request the guide handler consumes. */
export interface RequestLike {
  body: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}

/** Express-like response recorder the guide handler receives. */
export interface ResponseLike {
  sentStatus?: number;
  sentBody?: unknown;
  status(code: number): ResponseLike;
  send(body?: unknown): ResponseLike;
  sendStatus(code: number): ResponseLike;
}

/** A route handler as registered by `app.post(route, handler)`. */
export type HandlerFn = (req: RequestLike, res: ResponseLike) => void | Promise<void>;

/** Fixture delivery passed to the compiled handler. */
export interface HarnessFixture {
  body: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}

export interface ClaimedJob {
  tranId: string;
  merchantRef: string;
  amount: number;
  currency: string;
}

/** Order-lookup collaborator the guide handler calls. */
export interface OrdersCollaborator {
  findByCustomerRef: (merchantRef: string) => { expectsExactly: (amount: number, currency: string) => boolean } | null;
}

/**
 * Build the collaborator stubs a guide handler expects. Spread the returned
 * `context` into the vm sandbox (minus `app`, which the test replaces with a
 * registering stub), and read outcomes off `claims`, `jobsQueued`, and the
 * recorder returned by `newResponse()`.
 */
export function buildHandlerHarness(opts: { orders: OrdersCollaborator; seen?: Set<string> }) {
  const claims: ClaimedJob[] = [];
  let queueCalls = 0;
  const seen = opts.seen ?? new Set<string>();

  type Transaction = {
    fulfillments: {
      claim: (tranId: string, meta: { merchant_ref: string; amount: number; currency: string }) => boolean;
    };
    outbox: { insert: (job: ClaimedJob) => void };
  };

  return {
    /** Values for the guide's bare-name collaborators (everything but `app`). */
    context: {
      payway: { verifyCallback: () => true },
      orders: opts.orders,
      db: {
        transaction: async (fn: (tx: Transaction) => Promise<void>) => {
          const pendingClaims: ClaimedJob[] = [];
          const jobs: ClaimedJob[] = [];
          await fn({
            fulfillments: {
              claim: (tranId, meta) => {
                if (seen.has(tranId) || pendingClaims.some((claim) => claim.tranId === tranId)) return false;
                pendingClaims.push({
                  tranId,
                  merchantRef: meta.merchant_ref,
                  amount: meta.amount,
                  currency: meta.currency,
                });
                return true;
              },
            },
            outbox: {
              insert: (job) => {
                jobs.push(job);
              },
            },
          });
          for (const claim of pendingClaims) seen.add(claim.tranId);
          claims.push(...pendingClaims);
          queueCalls += jobs.length;
        },
      },
      process: { env: { PAYWAY_MERCHANT_ID: 'fixture', PAYWAY_API_KEY: 'fixture' } },
      console,
    },
    /** Claims committed with their outbox jobs (normalized money included). */
    get claims() {
      return claims;
    },
    /** Durable outbox jobs committed by the handler. */
    get jobsQueued() {
      return queueCalls;
    },
    /** A fresh response recorder; assert on its `sentStatus` after the call. */
    newResponse(): ResponseLike {
      const rec = {} as ResponseLike;
      rec.status = (code: number) => {
        rec.sentStatus = code;
        return rec;
      };
      rec.sendStatus = (code: number) => {
        rec.sentStatus = code;
        return rec;
      };
      rec.send = (body?: unknown) => {
        rec.sentStatus = rec.sentStatus ?? 200;
        rec.sentBody = body;
        return rec;
      };
      return rec;
    },
  };
}

/** Wrap a callback body+headers into the RequestLike the handler expects. */
export function fixtureRequest(body: Record<string, unknown>): RequestLike {
  return { body, headers: { 'x-payway-hmac-sha512': 'fixture-signature' } };
}
