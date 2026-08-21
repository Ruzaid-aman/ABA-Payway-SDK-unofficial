export type KhqrCallbackEnrollment = 'not-requested' | 'requested' | 'confirmed-by-merchant';
export type KhqrCallbackVerification = 'unknown' | 'aba-confirmed-hmac' | 'mTLS' | 'ip-allowlist';

export interface KhqrCallbackConfiguration {
  url?: string;
  enrollment?: KhqrCallbackEnrollment;
  verification?: KhqrCallbackVerification;
}

export interface KhqrMerchantConfiguration {
  bakongId?: string;
  abaMerchantId?: string;
  acquirerName?: string;
  merchantCategoryCode?: string;
  merchantName?: string;
  merchantCity?: string;
  paywayData?: string;
  callback?: KhqrCallbackConfiguration;
}

export interface KhqrConfigurationIssue {
  code: string;
  path: string;
  message: string;
}

export interface KhqrConfigurationReadiness {
  ready: boolean;
  issues: KhqrConfigurationIssue[];
}

export interface KhqrCallbackReadiness {
  ready: boolean;
  issues: KhqrConfigurationIssue[];
}

export interface KhqrCallbackValidationOptions {
  allowLocalDevelopment?: boolean;
}

const environmentFields = {
  bakongId: 'PAYWAY_KHQR_BAKONG_ID',
  abaMerchantId: 'PAYWAY_KHQR_ABA_MERCHANT_ID',
  acquirerName: 'PAYWAY_KHQR_ACQUIRER_NAME',
  merchantCategoryCode: 'PAYWAY_KHQR_MERCHANT_CATEGORY_CODE',
  merchantName: 'PAYWAY_KHQR_MERCHANT_NAME',
  merchantCity: 'PAYWAY_KHQR_MERCHANT_CITY',
  paywayData: 'PAYWAY_KHQR_PAYWAY_DATA',
} as const;

type MerchantField = keyof typeof environmentFields;

const requiredFields: readonly MerchantField[] = [
  'bakongId',
  'abaMerchantId',
  'acquirerName',
  'merchantCategoryCode',
  'merchantName',
  'merchantCity',
  'paywayData',
];

const fieldLabels: Record<MerchantField, string> = {
  bakongId: 'Bakong ID',
  abaMerchantId: 'ABA merchant ID',
  acquirerName: 'acquirer name',
  merchantCategoryCode: 'merchant category code',
  merchantName: 'merchant name',
  merchantCity: 'merchant city',
  paywayData: 'PayWay data',
};

function issue(code: string, path: string, message: string): KhqrConfigurationIssue {
  return { code, path, message };
}

function isPresent(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Resolves each ABA-issued KHQR field independently. Constructor values are
 * deliberately preferred so an application never depends on process-global
 * profile state when it supplies a merchant configuration explicitly.
 */
export function resolveKhqrConfiguration(
  configuration: KhqrMerchantConfiguration | undefined = undefined,
): KhqrMerchantConfiguration {
  const resolved: KhqrMerchantConfiguration = { callback: configuration?.callback };

  for (const field of requiredFields) {
    resolved[field] = configuration?.[field] ?? process.env[environmentFields[field]];
  }

  if (resolved.callback === undefined) {
    delete resolved.callback;
  }

  return resolved;
}

/**
 * Validates the merchant data needed to produce an ABA KHQR payload. Issues
 * identify fields and stable codes, but never echo merchant-provided values.
 */
export function validateKhqrConfiguration(
  configuration: KhqrMerchantConfiguration | undefined,
): KhqrConfigurationReadiness {
  const resolved = configuration ?? {};
  const issues: KhqrConfigurationIssue[] = [];

  for (const field of requiredFields) {
    if (!isPresent(resolved[field])) {
      issues.push(
        issue(
          `KHQR_${toIssueSegment(field)}_REQUIRED`,
          `khqr.${field}`,
          `${fieldLabels[field]} is required for ABA KHQR generation`,
        ),
      );
    }
  }

  if (isPresent(resolved.abaMerchantId) && !/^\d{15}$/.test(resolved.abaMerchantId)) {
    issues.push(
      issue('KHQR_ABA_MERCHANT_ID_INVALID', 'khqr.abaMerchantId', 'ABA merchant ID must contain exactly 15 digits'),
    );
  }

  if (isPresent(resolved.merchantCategoryCode) && !/^\d{4}$/.test(resolved.merchantCategoryCode)) {
    issues.push(
      issue(
        'KHQR_MERCHANT_CATEGORY_CODE_INVALID',
        'khqr.merchantCategoryCode',
        'merchant category code must contain exactly 4 digits',
      ),
    );
  }

  if (isPresent(resolved.merchantName) && resolved.merchantName.length > 25) {
    issues.push(
      issue('KHQR_MERCHANT_NAME_TOO_LONG', 'khqr.merchantName', 'merchant name must be at most 25 characters'),
    );
  }

  if (isPresent(resolved.merchantCity) && resolved.merchantCity.length > 15) {
    issues.push(
      issue('KHQR_MERCHANT_CITY_TOO_LONG', 'khqr.merchantCity', 'merchant city must be at most 15 characters'),
    );
  }

  if (isPresent(resolved.paywayData) && Buffer.byteLength(resolved.paywayData, 'utf8') > 99) {
    issues.push(issue('KHQR_PAYWAY_DATA_TOO_LONG', 'khqr.paywayData', 'PayWay data must be at most 99 UTF-8 bytes'));
  }

  return { ready: issues.length === 0, issues };
}

/**
 * Checks the operator-declared notification setup. A ready result is not
 * evidence that ABA has actually configured or whitelisted the callback.
 */
export function validateKhqrCallbackSetup(
  callback: KhqrCallbackConfiguration | undefined,
  options: KhqrCallbackValidationOptions = {},
): KhqrCallbackReadiness {
  const issues: KhqrConfigurationIssue[] = [];
  const url = callback?.url;

  if (!isPresent(url)) {
    issues.push(
      issue('KHQR_CALLBACK_URL_REQUIRED', 'khqr.callback.url', 'callback URL is required for payment notifications'),
    );
  } else if (!isAllowedCallbackUrl(url, options.allowLocalDevelopment === true)) {
    issues.push(
      issue(
        'KHQR_CALLBACK_URL_HTTPS_REQUIRED',
        'khqr.callback.url',
        'callback URL must use HTTPS unless local development is enabled',
      ),
    );
  }

  if (callback?.enrollment !== 'confirmed-by-merchant') {
    issues.push(
      issue(
        'KHQR_CALLBACK_ENROLLMENT_UNCONFIRMED',
        'khqr.callback.enrollment',
        'ask ABA to configure and whitelist the callback URL, then confirm the enrollment',
      ),
    );
  }

  if (callback?.verification === undefined || callback.verification === 'unknown') {
    issues.push(
      issue(
        'KHQR_CALLBACK_VERIFICATION_UNKNOWN',
        'khqr.callback.verification',
        'configure a non-unknown ABA callback verification strategy before relying on notifications',
      ),
    );
  }

  return { ready: issues.length === 0, issues };
}

function toIssueSegment(field: MerchantField): string {
  return field.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();
}

function isAllowedCallbackUrl(value: string, allowLocalDevelopment: boolean): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:') {
      return true;
    }

    return (
      allowLocalDevelopment &&
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}
