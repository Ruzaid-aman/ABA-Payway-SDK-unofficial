import { Router, type Request } from 'express';
import { IntegrationError, orderIdFromBody, type Route, type createIntegration } from './service.js';

type Service = ReturnType<typeof createIntegration>;
// Supply the merchant's EXISTING authenticated user resolver. Callback routes
// are public; the service verifies signed routes / queries its saved link.
export function integrationRouter(service: Service, authenticatedUserId: (request: Request) => string | undefined) {
  const router = Router();
  router.post('/payments/create/:route', async (req, res) => {
    try {
      const owner = authenticatedUserId(req);
      if (!owner) throw new IntegrationError(401, 'Authentication required');
      const result = await service.create(orderIdFromBody(req.body), owner, req.params.route as Route);
      res.status(201).json(result);
    } catch (error) {
      res
        .status(error instanceof IntegrationError ? error.status : 503)
        .json({ error: error instanceof IntegrationError ? error.message : 'Payment temporarily unavailable' });
    }
  });
  router.post('/payments/callback', (req, res) => {
    try {
      res.status(202).json(service.signal(req.body ?? {}, String(req.headers['x-payway-hmac-sha512'] ?? '')));
    } catch (error) {
      res
        .status(error instanceof IntegrationError ? error.status : 503)
        .json({ error: error instanceof IntegrationError ? error.message : 'Acceptance unavailable' });
    }
  });
  router.get('/payments/status/:attemptId', async (req, res) => {
    try {
      const owner = authenticatedUserId(req);
      if (!owner) throw new IntegrationError(401, 'Authentication required');
      res.json(await service.reconcile(req.params.attemptId, owner));
    } catch (error) {
      res
        .status(error instanceof IntegrationError ? error.status : 503)
        .json({ error: error instanceof IntegrationError ? error.message : 'Inquiry temporarily unavailable' });
    }
  });
  return router;
}
