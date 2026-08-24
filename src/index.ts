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

export {
  PAYMENT_STATUS_CODES,
  PAYMENT_STATUS_LABELS,
  REFUND_ERROR_CODES,
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
export { parseKhqrPaymentNotification } from './webhook/khqr-notification.js';
export type { KhqrWebhookMetadata, WebhookRecord, WebhookStorage } from './webhook/storage.js';
export type { StorageType } from './webhook/storage-factory.js';
// ─── Webhook Storage ─────────────────────────────────────────────────────
export { createStorage } from './webhook/storage-factory.js';
