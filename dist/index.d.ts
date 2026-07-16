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
declare class PayWay {
    private config;
    private baseUrl;
    constructor(config: PayWayConfig);
    private request;
    private requestWithMerchantAuth;
    verifyCallback(body: Record<string, any>, signature: string): boolean;
    readonly checkout: {
        createTransaction: (params: CreateTransactionParams) => Record<string, any> & {
            hash: string;
        };
        checkTransaction: (transactionId: string, requestTime?: string) => Promise<unknown>;
        closeTransaction: (transactionId: string, requestTime?: string) => Promise<unknown>;
        getTransactionDetail: (transactionId: string, requestTime?: string) => Promise<unknown>;
        getTransactionList: (params: GetTransactionListParams) => Promise<unknown>;
        refund: (transactionId: string, amount: number) => Promise<unknown>;
        getExchangeRate: (requestTime?: string) => Promise<unknown>;
    };
    readonly credentialsOnFile: {
        linkAccount: (params: LinkAccountParams) => Promise<unknown>;
        linkCard: (params: LinkCardParams) => Promise<unknown>;
        payment: (params: CofPaymentParams) => Promise<unknown>;
        renewToken: (params: TokenParams) => Promise<unknown>;
        getTokenDetails: (params: TokenParams) => Promise<unknown>;
        removeToken: (params: TokenParams) => Promise<unknown>;
    };
    readonly qr: {
        generateQr: (params: GenerateQrParams) => Promise<unknown>;
    };
    readonly paymentLink: {
        create: (params: CreatePaymentLinkParams) => Promise<unknown>;
        getDetails: (paymentLinkId: string) => Promise<unknown>;
    };
    readonly preAuth: {
        complete: (transactionId: string, amount: number) => Promise<unknown>;
        completeWithPayout: (transactionId: string, amount: number, payout: {
            acc: string;
            amt: number;
        }[]) => Promise<unknown>;
        cancel: (transactionId: string) => Promise<unknown>;
    };
    readonly payout: {
        payout: (params: PayoutParams) => Promise<unknown>;
        updateBeneficiaryStatus: (params: UpdateBeneficiaryStatusParams) => Promise<unknown>;
        addBeneficiary: (params: AddBeneficiaryParams) => Promise<unknown>;
    };
    readonly khqr: {
        getTransactionsByMerchantRef: (merchantRef: string, requestTime?: string) => Promise<unknown>;
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
    readonly paywayCode?: string | number;
    readonly rawBody?: any;
    constructor(message: string, options?: {
        statusCode?: number;
        paywayCode?: string | number;
        rawBody?: any;
    });
}

export { type AddBeneficiaryParams, type CofPaymentParams, type CreatePaymentLinkParams, type CreateTransactionParams, type Currency, type Environment, type GenerateQrParams, type GetTransactionListParams, type ItemEntry, type LinkAccountParams, type LinkCardParams, PayWay, PayWayAPIError, type PayWayConfig, PayWayConfigError, PayWayError, type PayoutParams, type TokenParams, type UpdateBeneficiaryStatusParams, verifyCallbackSignature };
