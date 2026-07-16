/**
 * Parameters for generating an offline merchant-scannable QR code.
 *
 * Important: this helper produces a **custom TLV-encoded QR string** with a
 * CRC-16 checksum. It is **not** an official Bakong KHQR / EMVCo QR-MPM code
 * and should not be presented to customers as a standard KHQR. Use it only as
 * an offline fallback for merchant-owned scanners that understand this format.
 */
interface GenerateOfflineQrParams {
    merchantId: string;
    transactionId: string;
    amount: number;
    currency: 'KHR' | 'USD';
    merchantRef: string;
    tipAmount?: number;
    feeAmount?: number;
    transactionType?: 'purchase' | 'refund' | 'cash';
}

/**
 * Verifies a webhook signature using PayWay's sorted-key signature validation algorithm.
 */
declare function verifyCallbackSignature(body: Record<string, any>, receivedSignature: string, apiKey: string): boolean;

type Currency = 'USD' | 'KHR';
type Environment = 'sandbox' | 'production';
interface ItemEntry {
    name: string;
    quantity: number;
    price: number;
}
interface PayWayConfig {
    merchantId: string;
    apiKey: string;
    publicKeyPem?: string;
    environment?: 'sandbox' | 'production';
    timeout?: number;
    baseUrl?: string;
    maxRetries?: number;
    retryDelayMs?: number;
    onRequest?: (endpoint: string, bodyPayload: string) => void;
    onResponse?: (endpoint: string, statusCode: number, body: any) => void;
}
interface GatewayErrorDetails {
    code?: string | number;
    message?: string;
    rawBody?: any;
    statusCode?: number;
}
interface CreateTransactionParams {
    transactionId: string;
    amount: number;
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    type?: 'purchase' | 'pre-auth';
    paymentOption?: 'cards' | 'abapay_khqr' | 'abapay_khqr_deeplink' | 'alipay' | 'wechat' | 'google_pay' | string;
    items?: string | ItemEntry[];
    shipping?: number;
    currency?: 'KHR' | 'USD';
    returnUrl?: string;
    cancelUrl?: string;
    skipSuccessPage?: 0 | 1;
    continueSuccessUrl?: string;
    returnDeeplink?: string | {
        ios_scheme: string;
        android_scheme: string;
    };
    customFields?: string | Record<string, any>;
    returnParams?: string;
    viewType?: 'hosted_view' | 'popup';
    paymentGate?: number;
    payout?: string | {
        acc: string;
        amt: number;
    }[];
    additionalParams?: string | Record<string, any>;
    lifetime?: number;
    googlePayToken?: string;
}
interface LinkAccountParams {
    requestId: string;
    ctid?: string;
    returnDeeplink?: string | {
        ios_scheme: string;
        android_scheme: string;
    };
    tokenFlag?: string;
    currency?: 'KHR' | 'USD';
    callbackUrl?: string;
    requestTime?: string;
}
interface LinkCardParams {
    requestId: string;
    ctid?: string;
    returnDeeplink?: string | {
        ios_scheme: string;
        android_scheme: string;
    };
    tokenFlag?: string;
    frequency?: '1W' | '1M' | '2M';
    returnUrl?: string;
    callbackUrl?: string;
    requestTime?: string;
}
interface CofPaymentParams {
    requestId: string;
    transactionId: string;
    amount: number;
    ctid?: string;
    paymentToken: string;
    tokenFlag?: string;
    currency?: 'KHR' | 'USD';
    callbackUrl?: string;
    requestTime?: string;
}
interface TokenParams {
    requestId: string;
    ctid: string;
    paymentToken: string;
    requestTime?: string;
}
interface GenerateQrParams {
    transactionId: string;
    amount: number;
    paymentOption: 'abapay_khqr' | string;
    callbackUrl: string;
    purchaseType?: 'purchase';
    currency?: 'KHR' | 'USD';
    qrImageTemplate?: string;
    requestTime?: string;
}
interface CreatePaymentLinkParams {
    title: string;
    amount: number;
    description?: string;
    paymentLimit?: number;
    returnUrl?: string;
    merchantRefNo: string;
    expiredDate?: number;
}
interface PayoutParams {
    transactionId: string;
    amount: number;
    beneficiaries: {
        account: string;
        amount: number;
    }[];
    currency: Currency;
    customFields?: string | Record<string, any>;
}
interface UpdateBeneficiaryStatusParams {
    payee: string;
    status: 0 | 1;
}
interface AddBeneficiaryParams {
    payee: string;
}
interface GetTransactionListParams {
    fromDate?: string | null;
    toDate?: string | null;
    fromAmount?: number | string | null;
    toAmount?: number | string | null;
    status?: string | null;
    page?: string;
    pagination?: string;
    requestTime?: string;
}
/**
 * PayWay SDK client.
 *
 * @example
 * const payway = new PayWay({ merchantId, apiKey, environment: 'sandbox' });
 */
declare class PayWay {
    private config;
    private baseUrl;
    /**
     * Create a new PayWay SDK client instance.
     *
     * @param config - The SDK configuration options.
     * @param config.merchantId - The merchant ID issued by PayWay.
     * @param config.apiKey - The API key/secret issued by PayWay for signing.
     * @param config.publicKeyPem - The 1024-bit RSA public key PEM string for encrypting request payloads.
     * @param config.environment - The target environment ('sandbox' or 'production'). Defaults to 'sandbox'.
     * @param config.timeout - The request timeout in milliseconds. Defaults to 30,000 (30 seconds).
     * @param config.baseUrl - Optional override for the base API URL.
     * @throws {PayWayConfigError} If the configuration is missing or invalid.
     */
    constructor(config: PayWayConfig);
    private _executeFetch;
    private request;
    private requestWithMerchantAuth;
    /**
     * Verify the signature of a webhook/callback notification from PayWay.
     *
     * @param body - The raw request body or parsed payload from the callback without the `hash` field.
     * @param signature - The signature/hash received from the PayWay callback headers/body.
     * @returns True if the signature is valid and authentic, false otherwise.
     */
    verifyCallback(body: Record<string, any>, signature: string): boolean;
    getGatewayErrorDetails(error: unknown): GatewayErrorDetails | null;
    /**
     * Checkout-related API helpers.
     */
    readonly checkout: {
        /**
         * Create a signed transaction payload for a client-side checkout form.
         * This prepares parameters, formats quantities/currencies/amounts, base64 encodes payloads as needed,
         * and signs the payload with the merchant HMAC signature.
         *
         * @param params - The checkout transaction parameters.
         * @param params.transactionId - The unique identifier for the transaction.
         * @param params.amount - The purchase amount.
         * @param params.firstname - First name of the customer.
         * @param params.lastname - Last name of the customer.
         * @param params.email - Email address of the customer.
         * @param params.phone - Phone number of the customer.
         * @param params.type - The transaction type ('purchase' or 'pre-auth'). Defaults to 'purchase'.
         * @param params.paymentOption - The active payment option (e.g. 'cards', 'abapay_khqr').
         * @param params.items - Shopping cart items list or raw encoded string.
         * @param params.shipping - The shipping fee amount.
         * @param params.currency - The currency of the transaction ('KHR' or 'USD'). Defaults to 'USD'.
         * @param params.returnUrl - The merchant URL where the user is redirected after successful payment.
         * @param params.cancelUrl - The merchant URL where the user is redirected if payment is cancelled.
         * @param params.skipSuccessPage - Whether to skip the ABA/PayWay success page (0 or 1).
         * @param params.continueSuccessUrl - The redirect URL to continue after payment success.
         * @param params.returnDeeplink - Custom redirect deeplink for mobile applications.
         * @param params.customFields - Metadata fields to attach to the transaction.
         * @param params.returnParams - String of custom query parameters to pass back to the redirect URL.
         * @param params.viewType - The display view style ('hosted_view' or 'popup').
         * @param params.paymentGate - The gateway type routing.
         * @param params.payout - Optional array of payout instructions.
         * @param params.additionalParams - Additional key-value options.
         * @param params.lifetime - Lifespan of checkout page/session in seconds.
         * @param params.googlePayToken - Raw Google Pay authorization token.
         * @returns A signed object containing checkout transaction fields and a `hash` field.
         */
        createTransaction: (params: CreateTransactionParams) => Record<string, any> & {
            hash: string;
        };
        /**
         * Check the status of a checkout transaction.
         *
         * @param transactionId - The transaction identifier to query.
         * @param requestTime - Optional custom ISO/request timestamp.
         * @returns A promise resolving to the transaction status response.
         */
        checkTransaction: (transactionId: string, requestTime?: string) => Promise<{
            data?: {
                payment_status_code?: number | undefined;
                payment_status?: "APPROVED" | "PRE-AUTH" | "REFUNDED" | "PENDING" | "DECLINED" | "CANCELLED" | undefined;
                total_amount?: number | undefined;
                original_amount?: number | undefined;
                refund_amount?: number | undefined;
                discount_amount?: number | undefined;
                payment_amount?: number | undefined;
                payment_currency?: string | undefined;
                apv?: string | undefined;
                transaction_date?: string | undefined;
            } | undefined;
            status: {
                code: string;
                message: string;
                tran_id?: string | undefined;
            };
        }>;
        /**
         * Close an active checkout transaction.
         *
         * @param transactionId - The transaction identifier to close.
         * @param requestTime - Optional custom ISO/request timestamp.
         * @returns A promise resolving to the transaction closure response.
         */
        closeTransaction: (transactionId: string, requestTime?: string) => Promise<{
            status: {
                code: string;
                message: string;
                tran_id?: string | undefined;
            };
        }>;
        /**
         * Retrieve details for a specific transaction.
         *
         * @param transactionId - The transaction identifier to query.
         * @param requestTime - Optional custom ISO/request timestamp.
         * @returns A promise resolving to the transaction details response.
         */
        getTransactionDetail: (transactionId: string, requestTime?: string) => Promise<{
            data?: {
                transaction_id?: string | undefined;
                payment_status_code?: number | undefined;
                payment_status?: "APPROVED" | "PRE-AUTH" | "REFUNDED" | "PENDING" | "DECLINED" | "CANCELLED" | undefined;
                original_amount?: number | undefined;
                original_currency?: string | undefined;
                payment_amount?: number | undefined;
                payment_currency?: string | undefined;
                total_amount?: number | undefined;
                refund_amount?: number | undefined;
                discount_amount?: number | undefined;
                apv?: string | undefined;
                transaction_date?: string | undefined;
                first_name?: string | undefined;
                last_name?: string | undefined;
                email?: string | undefined;
                phone?: string | undefined;
                bank_ref?: string | undefined;
                payment_type?: "ABA Pay" | "Alipay" | "Wechat" | "KHQR" | "VISA" | "MC" | "JCB" | "CUP" | undefined;
                payer_account?: string | undefined;
                bank_name?: string | undefined;
                card_source?: "ONUS" | "OFFUS_DOMESTIC" | "OFFUS_INTERNATIONAL" | undefined;
                transaction_operations?: {
                    status?: "Completed" | "Pre-Auth" | "Completed Pre-Auth" | "Cancelled Pre-Auth" | "Refunded" | undefined;
                    amount?: number | undefined;
                    transaction_date?: string | undefined;
                    bank_ref?: string | undefined;
                }[] | undefined;
            } | undefined;
            status: {
                code: string;
                message: string;
                tran_id?: string | undefined;
            };
        }>;
        /**
         * Query transaction history filtering by date range, amount, status, and pagination options.
         *
         * @param params - The transaction list query parameters.
         * @param params.fromDate - The start date filter (format: YYYY-MM-DD).
         * @param params.toDate - The end date filter (format: YYYY-MM-DD).
         * @param params.fromAmount - The minimum transaction amount.
         * @param params.toAmount - The maximum transaction amount.
         * @param params.status - The transaction status to filter by.
         * @param params.page - The page index for pagination.
         * @param params.pagination - The maximum items per page.
         * @param params.requestTime - Optional request timestamp.
         * @returns A promise resolving to the list of transactions.
         */
        getTransactionList: (params: GetTransactionListParams) => Promise<{
            data?: {
                transaction_id?: string | undefined;
                transaction_date?: string | undefined;
                apv?: string | undefined;
                payment_status?: "APPROVED" | "PRE-AUTH" | "REFUNDED" | "PENDING" | "DECLINED" | "CANCELLED" | undefined;
                payment_status_code?: number | undefined;
                original_amount?: number | undefined;
                original_currency?: "USD" | "KHR" | undefined;
                total_amount?: number | undefined;
                discount_amount?: number | undefined;
                refund_amount?: number | undefined;
                payment_amount?: number | undefined;
                payment_currency?: string | undefined;
                first_name?: string | undefined;
                last_name?: string | undefined;
                email?: string | undefined;
                phone?: string | undefined;
                bank_ref?: string | undefined;
                payer_account?: string | undefined;
                bank_name?: string | undefined;
                card_source?: "ONUS" | "OFFUS_DOMESTIC" | "OFFUS_INTERNATIONAL" | undefined;
                payment_type?: "ABA Pay" | "Alipay" | "Wechat" | "KHQR" | "VISA" | "MC" | "JCB" | "CUP" | "N/A" | undefined;
            }[] | undefined;
            page?: string | undefined;
            pagination?: string | undefined;
            status: {
                code: string;
                message: string;
                tran_id?: string | undefined;
            };
        }>;
        /**
         * Refund a captured checkout transaction.
         *
         * @param transactionId - The transaction identifier to refund.
         * @param amount - The amount to refund.
         * @returns A promise resolving to the refund response details.
         */
        refund: (transactionId: string, amount: number) => Promise<{
            grand_total?: number | undefined;
            total_refunded?: number | undefined;
            currency?: string | undefined;
            transaction_status?: string | undefined;
            status: {
                code: string;
                message: string;
            };
        }>;
        /**
         * Retrieve the current exchange rate configured for the merchant.
         *
         * @param requestTime - Optional custom ISO/request timestamp.
         * @returns A promise resolving to the exchange rate response details.
         */
        getExchangeRate: (requestTime?: string) => Promise<{
            status: {
                code: string;
                message: string;
            };
            exchange_rates: {
                [key: string]: {
                    sell: string;
                    buy: string;
                };
            };
        }>;
    };
    /**
     * Credentials-on-File API helpers.
     */
    readonly credentialsOnFile: {
        /**
         * Link an ABA Bank account for stored-credential payments.
         *
         * @param params - Account linking parameters.
         * @param params.requestId - Unique client request ID.
         * @param params.ctid - Stored credential tracking identifier (token).
         * @param params.returnDeeplink - Deeplink redirect URL for mobile apps.
         * @param params.tokenFlag - Action flag indicating tokenization details.
         * @param params.currency - The currency of the account ('KHR' or 'USD').
         * @param params.callbackUrl - Optional endpoint where PayWay sends status callbacks.
         * @param params.requestTime - Optional request timestamp.
         * @returns A promise resolving to the link account response.
         */
        linkAccount: (params: LinkAccountParams) => Promise<{
            status?: {
                code?: string | undefined;
                message?: string | undefined;
            } | undefined;
            qr_string?: string | undefined;
            abapay_deeplink?: string | undefined;
        }>;
        /**
         * Link a debit or credit card to create stored payment credentials.
         *
         * @param params - Card linking parameters.
         * @param params.requestId - Unique client request ID.
         * @param params.ctid - Stored credential tracking identifier (token).
         * @param params.returnDeeplink - Deeplink redirect URL for mobile apps.
         * @param params.tokenFlag - Action flag indicating tokenization details.
         * @param params.frequency - Card usage authorization frequency ('1W', '1M', or '2M').
         * @param params.returnUrl - Merchant landing page redirect URL.
         * @param params.callbackUrl - Optional callback URL for status notifications.
         * @param params.requestTime - Optional request timestamp.
         * @returns A promise resolving to the link card response details.
         */
        linkCard: (params: LinkCardParams) => Promise<{
            status?: {
                code?: string | undefined;
                message?: string | undefined;
            } | undefined;
        }>;
        /**
         * Execute a payment using a saved stored-credential token.
         *
         * @param params - Stored-credential payment parameters.
         * @param params.requestId - Unique client request ID.
         * @param params.transactionId - Merchant reference transaction ID.
         * @param params.amount - The amount to charge.
         * @param params.ctid - Stored credential tracking identifier.
         * @param params.paymentToken - The stored payment token.
         * @param params.tokenFlag - Action flag.
         * @param params.currency - The payment currency ('KHR' or 'USD'). Defaults to 'USD'.
         * @param params.callbackUrl - Optional webhook callback URL.
         * @param params.requestTime - Optional request timestamp.
         * @returns A promise resolving to the payment execution response.
         */
        payment: (params: CofPaymentParams) => Promise<{
            status?: {
                code?: string | undefined;
                message?: string | undefined;
                tran_id?: string | undefined;
            } | undefined;
        }>;
        /**
         * Renew an existing stored-credential payment token.
         *
         * @param params - Token parameters.
         * @param params.requestId - Unique client request ID.
         * @param params.ctid - Stored credential tracking identifier.
         * @param params.paymentToken - The stored payment token.
         * @param params.requestTime - Optional request timestamp.
         * @returns A promise resolving to the token renewal status response.
         */
        renewToken: (params: TokenParams) => Promise<{
            status?: {
                code?: string | undefined; /**
                 * Lookup and retrieve KHQR transaction history matching a specific merchant reference.
                 *
                 * @param merchantRef - The merchant reference number.
                 * @param requestTime - Optional custom ISO/request timestamp.
                 * @returns A promise resolving to the transaction retrieval response.
                 */
                message?: string | undefined;
            } | undefined;
            new_token?: string | undefined;
        }>;
        /**
         * Query detailed status information for a stored payment token.
         *
         * @param params - Token parameters.
         * @param params.requestId - Unique client request ID.
         * @param params.ctid - Stored credential tracking identifier.
         * @param params.paymentToken - The stored payment token.
         * @param params.requestTime - Optional request timestamp.
         * @returns A promise resolving to the stored token information details.
         */
        getTokenDetails: (params: TokenParams) => Promise<{
            status?: {
                code?: string | undefined;
                message?: string | undefined;
            } | undefined;
            data?: {
                token?: string | undefined;
                token_type?: string | undefined;
                masked_account?: string | undefined;
                token_status?: string | undefined;
                expiry_date?: string | undefined;
            } | undefined;
        }>;
        /**
         * Deactivate and remove a stored payment token from the credentials-on-file registry.
         *
         * @param params - Token parameters.
         * @param params.requestId - Unique client request ID.
         * @param params.ctid - Stored credential tracking identifier.
         * @param params.paymentToken - The stored payment token.
         * @param params.requestTime - Optional request timestamp.
         * @returns A promise resolving to the token removal confirmation.
         */
        removeToken: (params: TokenParams) => Promise<{
            status?: {
                code?: string | undefined;
                message?: string | undefined;
            } | undefined;
        }>;
    };
    /**
     * QR API helpers.
     */
    readonly qr: {
        /**
         * Generate a dynamic merchant KHQR code for customer payment.
         *
         * @param params - The dynamic QR generation parameters.
         * @param params.transactionId - Merchant reference transaction ID.
         * @param params.amount - The payment amount.
         * @param params.paymentOption - The payment option target (e.g. 'abapay_khqr').
         * @param params.callbackUrl - The webhook notification callback endpoint.
         * @param params.purchaseType - The type of purchase. Defaults to 'purchase'.
         * @param params.currency - The currency of the payment ('KHR' or 'USD'). Defaults to 'USD'.
         * @param params.qrImageTemplate - Theme or layout template for the QR image. Defaults to 'template2'.
         * @param params.requestTime - Optional request timestamp.
         * @returns A promise resolving to the generated QR payload containing the QR code and image options.
         */
        generateQr: (params: GenerateQrParams) => Promise<{
            qrString?: string | undefined;
            qrImage?: string | undefined;
        }>;
    };
    /**
     * Payment Link API helpers.
     */
    readonly paymentLink: {
        /**
         * Generate a new reusable or single-use PayWay payment link.
         *
         * @param params - Payment link configuration.
         * @param params.title - Title of the payment link shown to customer.
         * @param params.amount - The billing amount.
         * @param params.description - Details or description of the product/service.
         * @param params.paymentLimit - Optional number of allowed payments for this link.
         * @param params.returnUrl - Merchant redirect landing URL.
         * @param params.merchantRefNo - Unique merchant reference number.
         * @param params.expiredDate - Unix epoch timestamp (seconds) after which the link expires.
         * @returns A promise resolving to the payment link creation response.
         */
        create: (params: CreatePaymentLinkParams) => Promise<{
            status?: {
                code?: string | undefined;
                message?: string | undefined;
            } | undefined;
            payment_link?: string | undefined;
            tran_id?: string | undefined;
        }>;
        /**
         * Retrieve status, configuration, and details of a payment link.
         *
         * @param paymentLinkId - The identifier of the payment link.
         * @returns A promise resolving to the payment link configuration and transaction logs.
         */
        getDetails: (paymentLinkId: string) => Promise<{
            status?: {
                code?: string | undefined;
                message?: string | undefined;
            } | undefined;
            data?: {
                tran_id?: string | undefined;
                amount?: number | undefined;
                currency?: string | undefined;
                payment_status?: string | undefined;
                payment_link?: string | undefined;
                created_date?: string | undefined;
                expiry_date?: string | undefined;
            } | undefined;
        }>;
    };
    /**
     * Pre-authorization API helpers.
     */
    readonly preAuth: {
        /**
         * Capture funds for an existing pre-authorized transaction.
         *
         * @param transactionId - The transaction ID of the pre-authorized transaction.
         * @param amount - The final amount to capture and capture/settle.
         * @returns A promise resolving to the capture response.
         */
        complete: (transactionId: string, amount: number) => Promise<{
            status?: {
                code: string;
                message: string;
            } | undefined;
            transaction_status?: string | undefined;
            total_amount?: number | undefined;
        }>;
        /**
         * Capture funds for a pre-authorized transaction and attach multi-account payout instructions.
         *
         * @param transactionId - The transaction ID of the pre-authorized transaction.
         * @param amount - The capture amount.
         * @param payout - Multi-destination payout instructions.
         * @returns A promise resolving to the capture and payout execution response.
         */
        completeWithPayout: (transactionId: string, amount: number, payout: {
            acc: string;
            amt: number;
        }[]) => Promise<{
            status?: {
                code: string;
                message: string;
            } | undefined;
            transaction_status?: string | undefined;
            total_amount?: number | undefined;
        }>;
        /**
         * Release/void a pre-authorized transaction to unlock customer funds.
         *
         * @param transactionId - The transaction ID of the pre-authorized transaction.
         * @returns A promise resolving to the cancellation/void status response.
         */
        cancel: (transactionId: string) => Promise<{
            status?: {
                code: string;
                message: string;
            } | undefined;
            transaction_status?: string | undefined;
        }>;
    };
    /**
     * Payout API helpers.
     */
    readonly payout: {
        /**
         * Initiate a bulk/single payout instruction to whitelisted beneficiary accounts.
         *
         * @param params - Payout request parameters.
         * @param params.transactionId - Unique merchant reference identifier.
         * @param params.amount - Total payout amount.
         * @param params.beneficiaries - Array of whitelisted recipient account numbers and amounts.
         * @param params.currency - The currency of the payout ('KHR' or 'USD').
         * @param params.customFields - Optional metadata object or JSON string.
         * @returns A promise resolving to the payout transaction status.
         */
        payout: (params: PayoutParams) => Promise<{
            status?: {
                code: string;
                message: string;
                tran_id?: string | undefined;
            } | undefined;
            bank_ref?: string | undefined;
        }>;
        /**
         * Update the active status of a payout beneficiary.
         *
         * @param params - Beneficiary status parameters.
         * @param params.payee - The beneficiary account number/identifier.
         * @param params.status - Active state (1 for active, 0 for inactive).
         * @returns A promise resolving to the status update confirmation.
         */
        updateBeneficiaryStatus: (params: UpdateBeneficiaryStatusParams) => Promise<{
            status?: {
                code: string;
                message: string;
            } | undefined;
        }>;
        /**
         * Add and whitelist a new payee account for future payout transactions.
         *
         * @param params - Beneficiary parameters.
         * @param params.payee - The payee account number/identifier.
         * @returns A promise resolving to the whitelisting action response.
         */
        addBeneficiary: (params: AddBeneficiaryParams) => Promise<{
            status?: {
                code: string;
                message: string;
            } | undefined;
        }>;
    };
    /**
     * KHQR-specific API helpers.
     */
    readonly khqr: {
        /**
         * Generate a custom offline QR string without calling the PayWay API.
         *
         * This helper produces a merchant-scannable TLV payload with a CRC-16
         * checksum. It is **not** an official Bakong KHQR / EMVCo QR-MPM code;
         * use `qr.generateQr()` for PayWay-issued dynamic KHQR codes.
         *
         * @param params - Offline QR generation parameters.
         * @returns A TLV-encoded QR string with a CRC-16 checksum.
         */
        generateOfflineQR: (params: GenerateOfflineQrParams) => string;
        /**
         * Lookup and retrieve KHQR transaction history matching a specific merchant reference.
         *
         * @param merchantRef - The merchant reference number.
         * @param requestTime - Optional custom ISO/request timestamp.
         * @returns A promise resolving to the transaction retrieval response.
         */
        getTransactionsByMerchantRef: (merchantRef: string, requestTime?: string) => Promise<{
            status?: number | undefined;
            transactions?: {
                transaction_id?: string | undefined;
                transaction_date?: string | undefined;
                bank_ref?: string | undefined;
                apv?: string | undefined;
                discount_amount?: number | undefined;
                payment_status?: string | undefined;
                payment_amount?: number | undefined;
                payment_currency?: string | undefined;
                payment_type?: string | undefined;
                payer_account?: string | undefined;
                total_amount?: number | undefined;
                original_amount?: number | undefined;
                original_currency?: string | undefined;
                payment_status_code?: number | undefined;
                bank_name?: string | undefined;
                refund_amount?: number | undefined;
                merchant_ref?: string | undefined;
            }[] | undefined;
        }>;
    };
}

declare class PayWayError extends Error {
    constructor(message: string);
}
declare class PayWayConfigError extends PayWayError {
    constructor(message: string);
}
declare class PayWayAPIError extends PayWayError {
    readonly statusCode?: number;
    readonly paywayCode?: string;
    readonly rawBody?: any;
    readonly endpoint?: string;
    readonly retryable?: boolean;
    constructor(message: string, options?: {
        statusCode?: number;
        paywayCode?: string;
        rawBody?: any;
        endpoint?: string;
        retryable?: boolean;
    });
    toJSON(): Record<string, any>;
}

export { type AddBeneficiaryParams, type CofPaymentParams, type CreatePaymentLinkParams, type CreateTransactionParams, type Currency, type Environment, type GenerateQrParams, type GetTransactionListParams, type ItemEntry, type LinkAccountParams, type LinkCardParams, PayWay, PayWayAPIError, type PayWayConfig, PayWayConfigError, PayWayError, type PayoutParams, type TokenParams, type UpdateBeneficiaryStatusParams, verifyCallbackSignature };
