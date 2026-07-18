export {
  PayWay,
  verifyCallbackSignature,
} from './client.js';

export type {
  PayWayConfig,
  RateLimitInfo,
  RateLimitRule,
  CreateTransactionParams,
  LinkAccountParams,
  LinkCardParams,
  CofPaymentParams,
  TokenParams,
  GenerateQrParams,
  CreatePaymentLinkParams,
  PayoutParams,
  UpdateBeneficiaryStatusParams,
  AddBeneficiaryParams,
  GetTransactionListParams,
  ItemEntry,
  Currency,
  Environment,
} from './client.js';

export {
  PayWayError,
  PayWayConfigError,
  PayWayAPIError,
  PayWayBusinessError,
  PayWayNetworkError,
  PayWayRateLimitError,
  PayWaySignatureError,
} from './errors.js';

export type { CheckoutDomain } from './domains/checkout.js';

export type { CredentialsOnFileDomain } from './domains/credentials-on-file.js';

export type { QrDomain } from './domains/qr.js';

export type { PaymentLinkDomain } from './domains/payment-link.js';

export type { PreAuthDomain } from './domains/pre-auth.js';

export type { PayoutDomain } from './domains/payout.js';

export type { KhqrDomain } from './domains/khqr.js';

export type { GenerateOfflineQrParams } from './khqr-offline.js';

// ─── Decoupled SDK Facade (Modules 1, 2, 3) ─────────────────────────────────
export { sdk } from './sdk.js';
export type { Sdk } from './sdk.js';

export { server } from './server/index.js';
export type { ServerModule } from './server/index.js';
export { normalizePaywayResponse } from './server/index.js';

export { client } from './client-handler/index.js';
export type { ClientModule } from './client-handler/index.js';

export {
  runTestSuite,
  formatTestReport,
  generateMockSession,
  validateSessionContract,
  startMockPaywayServer,
  stopMockPaywayServer,
  getMockPaywayUrl,
  DEFAULT_TEST_CASES,
} from './test/index.js';
export type { TestHarnessDeps } from './test/index.js';

export type {
  TransactionSession,
  InitiateTransactionPayload,
  HandleResponseOptions,
  HandleResponseResult,
  ResponseType,
  SessionStatus,
  TestCase,
  TestResult,
  TestSuiteReport,
} from './schema.js';
