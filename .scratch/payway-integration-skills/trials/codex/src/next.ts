import { IntegrationError, orderIdFromBody, type Route, type createIntegration } from './service.js';

type Service = ReturnType<typeof createIntegration>;
// Export the returned POST/GET handler from the appropriate App Router route.ts.
// Supply the existing session resolver; never accept a user ID from the body.
export function nextIntegration(
  service: Service,
  authenticatedUserId: (request: Request) => Promise<string | undefined>,
) {
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
        const body: unknown = await req.json().catch(() => {
          throw new IntegrationError(400, 'Malformed JSON');
        });
        return Response.json(await service.create(orderIdFromBody(body), owner, route), { status: 201 });
      } catch (error) {
        return failure(error);
      }
    },
    callback: async (req: Request) => {
      try {
        return Response.json(
          service.signal((await req.json()) as Record<string, unknown>, req.headers.get('x-payway-hmac-sha512') ?? ''),
          { status: 202 },
        );
      } catch (error) {
        return failure(error);
      }
    },
    status: async (req: Request, attemptId: string) => {
      try {
        const owner = await authenticatedUserId(req);
        if (!owner) throw new IntegrationError(401, 'Authentication required');
        return Response.json(await service.reconcile(attemptId, owner));
      } catch (error) {
        return failure(error);
      }
    },
  };
}
