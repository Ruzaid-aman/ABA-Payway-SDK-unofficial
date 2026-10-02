import {
  IntegrationError,
  DEFAULT_CALLBACK_ACK,
  validateAck,
  type CallbackAck,
  type Route,
  type createIntegration,
} from './service.js';

type Service = ReturnType<typeof createIntegration>;
// Export the returned POST/GET handler from the appropriate App Router route.ts.
// Supply the existing session resolver; never accept a user ID from the body.
export function nextIntegration(
  service: Service,
  authenticatedUserId: (request: Request) => Promise<string | undefined>,
  ack: CallbackAck = DEFAULT_CALLBACK_ACK,
) {
  validateAck(ack);
  async function jsonBody(req: Request): Promise<unknown> {
    if (!/^application\/json(?:;|$)/i.test(req.headers.get('content-type') ?? ''))
      throw new IntegrationError(415, 'JSON content type required');
    const reader = req.body?.getReader();
    if (!reader) throw new IntegrationError(400, 'JSON body required');
    const decoder = new TextDecoder();
    let bytes = 0,
      text = '';
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 65536) {
          await reader.cancel();
          throw new IntegrationError(413, 'Callback/request too large');
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new IntegrationError(400, 'Malformed JSON');
    }
  }
  const failure = (error: unknown) =>
    Response.json(
      {
        error: error instanceof IntegrationError ? error.message : 'Payment temporarily unavailable',
      },
      { status: error instanceof IntegrationError ? error.status : 503 },
    );
  return {
    create: (route: Route) => async (req: Request) => {
      try {
        const owner = await authenticatedUserId(req);
        if (!owner) throw new IntegrationError(401, 'Authentication required');
        const body = (await jsonBody(req)) as { orderId?: string };
        if (!body || typeof body !== 'object' || Array.isArray(body))
          throw new IntegrationError(400, 'Malformed order request');
        return Response.json(await service.create(body.orderId ?? '', owner, route), { status: 201 });
      } catch (error) {
        return failure(error);
      }
    },
    callback: async (req: Request) => {
      try {
        service.signal((await jsonBody(req)) as Record<string, unknown>, req.headers.get('x-payway-hmac-sha512') ?? '');
        return new Response(ack.status === 204 || ack.status === 205 ? null : ack.body, {
          status: ack.status,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      } catch (error) {
        return failure(error);
      }
    },
    status: async (req: Request, attemptId: string) => {
      try {
        const owner = await authenticatedUserId(req);
        if (!owner) throw new IntegrationError(401, 'Authentication required');
        return Response.json(service.status(attemptId, owner));
      } catch (error) {
        return failure(error);
      }
    },
  };
}
