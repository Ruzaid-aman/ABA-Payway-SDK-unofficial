export const BASE_URLS = {
  sandbox: 'https://checkout-sandbox.payway.com.kh',
  production: 'https://checkout.payway.com.kh',
} as const;

export const ENDPOINTS = {
  checkTransaction: '/api/payment-gateway/v1/payments/check-transaction-2',
  closeTransaction: '/api/payment-gateway/v1/payments/close-transaction',
  getTransactionDetail: '/api/payment-gateway/v1/payments/transaction-detail',
  getTransactionList: '/api/payment-gateway/v1/payments/transaction-list-2',
  refund: '/api/merchant-portal/merchant-access/online-transaction/refund',
  getExchangeRate: '/api/payment-gateway/v1/exchange-rate',
  linkAccount: '/api/payment-credential/v3/aof/link-account',
  linkCard: '/api/payment-credential/v3/cof/link-card',
  payment: '/api/payment-gateway/v3/purchase/payment-credential',
  purchase: '/api/payment-gateway/v1/payments/purchase',
  renewToken: '/api/payment-credential/v3/token-management/renew-expired-account-token',
  getTokenDetails: '/api/payment-credential/v3/token-management/get-token-details',
  removeToken: '/api/payment-credential/v3/token-management/remove-token',
  generateQr: '/api/payment-gateway/v1/payments/generate-qr',
  createPaymentLink: '/api/merchant-portal/merchant-access/payment-link/create',
  getPaymentLinkDetails: '/api/merchant-portal/merchant-access/payment-link/detail',
  completePreAuth: '/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion',
  cancelPreAuth: '/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation',
  payout: '/api/payment-gateway/v2/direct-payment/merchant/payout',
  updateBeneficiaryStatus: '/api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status',
  addBeneficiary: '/api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout',
  getTransactionsByMerchantRef: '/api/payment-gateway/v1/payments/get-transactions-by-mc-ref',
} as const;

/**
 * Payment status codes returned by checkTransaction, getTransactionDetail,
 * and getTransactionList.
 *
 * Discovered via sandbox testing — these numeric codes are undocumented in
 * the OpenAPI spec but confirmed against live sandbox responses:
 *   - `payment_status_code: 0` → `payment_status: "APPROVED"`
 *   - `payment_status_code: 2` → `payment_status: "PENDING"`
 *   - `payment_status_code: 4` → `payment_status: "REFUNDED"`
 *
 * Use these constants instead of magic numbers:
 * @example
 * if (response.data?.payment_status_code === PAYMENT_STATUS_CODES.APPROVED) { ... }
 */
export const PAYMENT_STATUS_CODES = {
  APPROVED: 0,
  PRE_AUTH: 0, // same code as APPROVED; distinguish via payment_status string
  PENDING: 2,
  DECLINED: 3,
  REFUNDED: 4,
  CANCELLED: 7,
} as const;

/**
 * Human-readable payment status strings returned alongside the numeric codes.
 * Use this to build a reverse lookup or for display purposes.
 *
 * @example
 * const status = PAYMENT_STATUS_LABELS[0]; // "APPROVED"
 */
export const PAYMENT_STATUS_LABELS: Record<number, string> = {
  0: 'APPROVED',
  2: 'PENDING',
  3: 'DECLINED',
  4: 'REFUNDED',
  7: 'CANCELLED',
};

/**
 * PayWay refund-specific error codes discovered via sandbox testing.
 * These codes are returned in `status.code` on the refund endpoint.
 * Not an exhaustive list — PayWay may add new codes without notice.
 *
 * @see RefundResponse type in types.ts for the full status block shape.
 */
export const REFUND_ERROR_CODES = {
  /** Success */
  SUCCESS: '00',
  /** Invalid hash */
  INVALID_HASH: 'PTL02',
  /** Refund amount exceeds original transaction amount */
  REFUND_EXCEEDS_ORIGINAL: 'PTL37',
  /** Parameter validation required (e.g. refund_amount < 0.01) */
  PARAMETER_VALIDATION: 'PTL04',
  /** Unable to refund */
  UNABLE_TO_REFUND: 'PTL57',
  /** Refund failed */
  REFUND_FAILED: 'PTL58',
  /** Concurrent request rejected */
  CONCURRENT_REJECTED: 'PTL168',
  /** Insufficient available balance */
  INSUFFICIENT_BALANCE: 'PTL181',
  /** Transaction not found or is invalid (refund target does not exist) */
  REFUND_TARGET_NOT_FOUND: 'PTL36',
} as const;
