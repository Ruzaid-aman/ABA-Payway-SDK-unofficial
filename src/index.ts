export type {
  AddBeneficiaryParams,
  CofPaymentParams,
  CreatePaymentLinkParams,
  CreateTransactionParams,
  Currency,
  Environment,
  GenerateQrParams,
  GetTransactionListParams,
  ItemEntry,
  LinkAccountParams,
  LinkCardParams,
  PayoutParams,
  PayWayConfig,
  RateLimitInfo,
  RateLimitRule,
  TokenParams,
  UpdateBeneficiaryStatusParams,
} from './client.js';
export {
  PayWay,
  verifyCallbackSignature,
} from './client.js';
export type { ClientModule } from './client-handler/index.js';
export { client } from './client-handler/index.js';

export type { OpenImageResult } from './open-image.js';
export { defaultViewerCommandForPlatform, openImageInDefaultViewer } from './open-image.js';
export {
  PAYMENT_STATUS_CODES,
  PAYMENT_STATUS_LABELS,
  REFUND_ERROR_CODES,
  PRE_AUTH_ERROR_CODES,
  PAYOUT_ERROR_CODES,
  GATEWAY_CODE_HINTS,
} from './constants.js';
export type { CheckoutDomain } from './domains/checkout.js';
export type { CredentialsOnFileDomain } from './domains/credentials-on-file.js';
export type { KhqrDomain } from './domains/khqr.js';
export type { PaymentLinkDomain } from './domains/payment-link.js';
export type { PayoutDomain } from './domains/payout.js';
export type { PreAuthDomain } from './domains/pre-auth.js';
export type { QrDomain } from './domains/qr.js';
export type { PollAbortReason } from './errors.js';
export {
  PayWayAPIError,
  PayWayBusinessError,
  PayWayConfigError,
  PayWayError,
  PayWayNetworkError,
  PayWayRateLimitError,
  PayWaySignatureError,
  PayWayWebhookError,
  PollingAbortedError,
} from './errors.js';
// ─── Resilience & observability (TD-07/TD-08/TD-10) ────────────────────────
export {
  CircuitBreaker,
  CircuitOpenError,
  DEFAULT_CIRCUIT_BREAKER_OPTIONS,
} from './circuit-breaker.js';
export type { CircuitBreakerOptions, CircuitState } from './circuit-breaker.js';
export { createPayWayLogger, resolveLogLevel } from './logger.js';
export type { LogLevel, LogSink, PayWayLogger, PayWayLoggerOptions } from './logger.js';
export { computeTokenExpiry, daysUntilTokenExpiry } from './utils.js';
export {
  REQUEST_ID_PATTERN,
  TOKEN_FLAG_CHARGING,
  TOKEN_FLAG_LINKING,
  TOKEN_VALIDITY_DAYS,
} from './constants.js';
export type { WebhookServerOptions, WebhookServerResult } from './webhook/server.js';
export { createWebhookServer } from './webhook/server.js';
export type {
  KhqrCallbackConfiguration,
  KhqrCallbackEnrollment,
  KhqrCallbackReadiness,
  KhqrCallbackValidationOptions,
  KhqrCallbackVerification,
  KhqrConfigurationIssue,
  KhqrConfigurationReadiness,
  KhqrMerchantConfiguration,
} from './khqr-config.js';

export {
  resolveKhqrConfiguration,
  validateKhqrCallbackSetup,
  validateKhqrConfiguration,
} from './khqr-config.js';
export type { GenerateOfflineQrParams } from './khqr-offline.js';
export type {
  HandleResponseOptions,
  HandleResponseResult,
  InitiateTransactionPayload,
  ResponseType,
  SessionStatus,
  TestCase,
  TestResult,
  TestSuiteReport,
  TransactionSession,
} from './schema.js';
export type { Sdk } from './sdk.js';
// ─── Decoupled SDK Facade (Modules 1, 2, 3) ─────────────────────────────────
export { sdk } from './sdk.js';
export type { ServerModule } from './server/index.js';
export { normalizePaywayResponse, server } from './server/index.js';
export type { TestHarnessDeps } from './test/index.js';

export {
  DEFAULT_TEST_CASES,
  formatTestReport,
  generateMockSession,
  getMockPaywayUrl,
  runTestSuite,
  startMockPaywayServer,
  stopMockPaywayServer,
  validateSessionContract,
} from './test/index.js';
export type {
  PendingPaymentStatus,
  PollTransactionOptions,
  PollTransactionResult,
  TerminalPaymentStatus,
} from './types.js';
export { isValidPublicKeyPem, validateRefundAmount } from './utils.js';
export type { KhqrPaymentNotification, ParsedKhqrPaymentNotification } from './webhook/khqr-notification.js';
export { extractJsonPayload, parseKhqrPaymentNotification } from './webhook/khqr-notification.js';
export type { KhqrWebhookMetadata, WebhookRecord, WebhookStorage } from './webhook/storage.js';
export type { StorageType } from './webhook/storage-factory.js';
// ─── Webhook Storage ─────────────────────────────────────────────────────
export { createStorage } from './webhook/storage-factory.js';
