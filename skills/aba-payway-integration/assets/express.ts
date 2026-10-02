import { Router, type Request } from 'express';
import {
  IntegrationError,
  DEFAULT_CALLBACK_ACK,
  validateAck,
  type CallbackAck,
  type Route,
  type createIntegration,
} from './service.js';

type Service = ReturnType<typeof createIntegration>;
// Supply the merchant's EXISTING authenticated user resolver. Callback routes
// are public; the service verifies signed routes / queries its saved link.
export function integrationRouter(
  service: Service,
  authenticatedUserId: (request: Request) => string | undefined,
  ack: CallbackAck = DEFAULT_CALLBACK_ACK,
) {
  validateAck(ack);
  const router = Router();
  router.post('/payments/create/:route', async (req, res) => {
    try {
      const owner = authenticatedUserId(req);
      if (!owner) throw new IntegrationError(401, 'Authentication required');
      const result = await service.create(String(req.body?.orderId ?? ''), owner, req.params.route as Route);
      res.status(201).json(result);
    } catch (error) {
      res
        .status(error instanceof IntegrationError ? error.status : 503)
        .json({ error: error instanceof IntegrationError ? error.message : 'Payment temporarily unavailable' });
    }
  });
  router.post('/payments/callback', (req, res) => {
    try {
      service.signal(req.body ?? {}, String(req.headers['x-payway-hmac-sha512'] ?? ''));
      res.status(ack.status).type('text/plain').send(ack.body);
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
      res.json(service.status(req.params.attemptId, owner));
    } catch (error) {
      res
        .status(error instanceof IntegrationError ? error.status : 503)
        .json({ error: error instanceof IntegrationError ? error.message : 'Inquiry temporarily unavailable' });
    }
  });
  return router;
}
