export { paymentArtifact, paymentLifecycle, paymentNextStep } from './payment-lifecycle.js';
export type { PaymentArtifact, PaymentLifecycle } from './payment-lifecycle.js';
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
  PaymentLinkImage,
  RateLimitInfo,
  RateLimitRule,
  RequestCallOptions,
  RequestQrParams,
  RequestQrResponse,
  TokenParams,
  UpdateBeneficiaryStatusParams,
} from './client.js';
export {
  PayWay,
  verifyCallbackDetailed,
  verifyCallbackSignature,
} from './client.js';
export type { CallbackVerificationFailure, CallbackVerificationResult } from './auth.js';
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
export type { CheckoutDomain, CheckoutFormOptions } from './domains/checkout.js';
export type { CredentialsOnFileDomain, LinkCardFormOptions } from './domains/credentials-on-file.js';
export type { KhqrDomain, MerchantRefTransaction, TransactionsByMerchantRefResult } from './domains/khqr.js';
export { normalizeTransactionsByMerchantRefResponse } from './domains/khqr.js';
export type {
  PaymentLinkDomain,
  PaymentLinkPushback,
  PaymentLinkPushbackStatus,
} from './domains/payment-link.js';
export { PAYMENT_LINK_EXPIRY_MIN_SECONDS, parsePaymentLinkPushback } from './domains/payment-link.js';
export type { PayoutDomain } from './domains/payout.js';
export type { PreAuthDomain } from './domains/pre-auth.js';
export type { QrDomain } from './domains/qr.js';
export {
  REQUEST_QR_HASH_FIELDS,
  REQUEST_QR_PAYMENT_OPTIONS,
} from './domains/qr.js';
export type {
  SelfActivationCredentialInfoParams,
  SelfActivationCredentialInfoResponse,
  SelfActivationDomain,
  SelfActivationMerchantInfoParams,
  SelfActivationMerchantInfoResponse,
  SelfActivationRegisterParams,
  SelfActivationRegisterResponse,
  SelfActivationStatus,
} from './domains/self-activation.js';
export { createSelfActivationDomain } from './domains/self-activation.js';
export type { HostedPageOutcome, PollAbortReason } from './errors.js';
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
// ─── Transaction Journal (audit-results/transaction-data-audit REPORT §14) ──
export type {
  JournalContext,
  JournalEmitterInput,
  JournalErrorInfo,
  JournalEventKind,
  JournalEventV1,
  JournalMode,
  JournalOptions,
  JournalSink,
} from './journal/types.js';
export { DEFAULT_JOURNAL_DIR_NAME, DEFAULT_JOURNAL_FILE_NAME, JOURNAL_VERSION } from './journal/types.js';
export { PAYWAY_DATA_DIR_ENV, resolvePaywayDataRoot, resolveWebhookDir } from './config/data-root.js';
export { createJournalEmitter, JsonlJournalSink, pruneJournal, readJournalEvents, resolveJournalConfig } from './journal/writer.js';
export type { JournalFileRead, JournalPruneResult } from './journal/writer.js';
export { reconcileTransactions } from './journal/reconcile.js';
export type { ReconcileEntry, ReconcileOptions, ReconcileReport } from './journal/reconcile.js';
export { computeJournalStats } from './journal/stats.js';
export type {
  JournalErrorRow,
  JournalFunnel,
  JournalLatencyRow,
  JournalRetryRow,
  JournalStatsOptions,
  JournalStatsReport,
} from './journal/stats.js';
export { detectJournalAnomalies, explainTransaction } from './journal/intelligence.js';
export type {
  AnomaliesReport,
  JournalAnomaly,
  RcaOptions,
  RcaReport,
  RcaStep,
} from './journal/intelligence.js';
export { computeTokenExpiry, daysUntilTokenExpiry } from './utils.js';
export {
  PURCHASE_LIFETIME_MIN_MINUTES,
  QR_LIFETIME_MAX_SECONDS,
  QR_LIFETIME_MIN_SECONDS,
  REQUEST_ID_PATTERN,
  TOKEN_FLAG_CHARGING,
  TOKEN_FLAG_LINKING,
  TOKEN_VALIDITY_DAYS,
} from './constants.js';
export type { WebhookServerOptions, WebhookServerResult } from './webhook/server.js';
export { createWebhookServer } from './webhook/server.js';
export type { ForwardOutcome, ForwardStats, WebhookForwarderOptions } from './webhook/forwarder.js';
export { WebhookForwarder, parseForwardHeaders } from './webhook/forwarder.js';
export type {
  WebhookFixture,
  WebhookFixtureEvent,
  WebhookFixtureOverrides,
} from './webhook/fixtures.js';
export { buildWebhookFixture, WEBHOOK_FIXTURE_EVENTS } from './webhook/fixtures.js';
export { signCallbackBody } from './auth.js';
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
export type { GenerateOfflineQrParams, KhqrPayloadInspection } from './khqr-offline.js';
export { inspectKhqrPayload, khqrCrc16, validateKhqrCrc } from './khqr-offline.js';
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
  PurchaseHostedHtmlResult,
  TerminalPaymentStatus,
} from './domain-types.js';
export type { LinkCardResponse } from './domain-types.js';
export { buildAbaPayDeeplink, computeRefundableBalance, isValidPublicKeyPem, validateRefundAmount } from './utils.js';
export type { RefundMoneySide, RefundableBalanceResult } from './utils.js';
// ─── Sandbox test-card registry (ABA integration-team relay 2026-09-12) ────
// Exported because integrators (and the aba-payway-first-payment skill) need
// the seeded hosted-card test PANs for sandbox checkout testing without
// reaching into package internals. Sandbox-only; the list may rotate.
export { SANDBOX_TEST_CARDS, isKnownSandboxTestCard, listSandboxTestCards } from './sandbox-test-cards.js';
export type { SandboxTestCard, SandboxTestCardBrand, SandboxTestCardOutcome } from './sandbox-test-cards.js';
// ─── Sandbox beneficiary registry (used by pre-auth/payout validation) ─────
// Exported because the aba-payway-sandbox-beneficiaries skill (and integrators
// writing sandbox probes) need the seeded-account list and the structural
// validator without reaching into package internals (audit S2.1 fold-in).
export { listSandboxBeneficiaries, validateSandboxBeneficiary } from './sandbox-beneficiaries.js';
export type {
  BeneficiaryKind,
  SandboxBeneficiary,
  SandboxCurrency,
  ValidateSandboxBeneficiaryOptions,
} from './sandbox-beneficiaries.js';
export type { KhqrPaymentNotification, ParsedKhqrPaymentNotification } from './webhook/khqr-notification.js';
export { extractJsonPayload, parseKhqrPaymentNotification } from './webhook/khqr-notification.js';
export type { CallbackKind, CustomerQrCustomer, ParsedCustomerQrCallback } from './webhook/customer-callback.js';
export { classifyCallback, parseCustomerQrCallback } from './webhook/customer-callback.js';
export type { ParsedCofLinkCallback } from './webhook/cof-callback.js';
export { isCofLinkCallback, parseCofLinkCallback } from './webhook/cof-callback.js';
export type { LinkedTokenRecord } from './webhook/token-store.js';
export {
  latestTokenForCtid,
  loadLinkedTokens,
  maskPwt,
  resolveTokenStoreDir,
  saveLinkedToken,
} from './webhook/token-store.js';
export type { CustomerQrWebhookMetadata, KhqrWebhookMetadata, WebhookRecord, WebhookStorage } from './webhook/storage.js';
export type { StorageType } from './webhook/storage-factory.js';
// ─── Webhook Storage ─────────────────────────────────────────────────────
export { createStorage } from './webhook/storage-factory.js';
