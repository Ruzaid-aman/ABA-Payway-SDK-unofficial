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
