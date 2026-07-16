/**
 * Parameters for generating an offline merchant-scannable QR code.
 *
 * Important: this helper produces a **custom TLV-encoded QR string** with a
 * CRC-16 checksum. It is **not** an official Bakong KHQR / EMVCo QR-MPM code
 * and should not be presented to customers as a standard KHQR. Use it only as
 * an offline fallback for merchant-owned scanners that understand this format.
 */
export interface GenerateOfflineQrParams {
  merchantId: string;
  transactionId: string;
  amount: number;
  currency: 'KHR' | 'USD';
  merchantRef: string;
  tipAmount?: number;
  feeAmount?: number;
  transactionType?: 'purchase' | 'refund' | 'cash';
}

function formatAmount(amount: number, currency: 'KHR' | 'USD'): string {
  if (currency === 'KHR') {
    return Math.round(amount).toString();
  }
  return amount.toFixed(2);
}

function encodeTlv(tag: string, value: string): string {
  const length = value.length;
  const lengthStr = length.toString().padStart(2, '0');
  return `${tag}${lengthStr}${value}`;
}

function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Generate a custom offline QR code without calling the PayWay API.
 *
 * The output uses a simple Tag-Length-Value payload with a CRC-16 CCITT
 * checksum. This is **not** an official Bakong KHQR code and will not be
 * readable by generic consumer banking apps. Use `qr.generateQr()` for
 * PayWay-issued dynamic KHQR codes.
 */
export function generateOfflineQR(params: GenerateOfflineQrParams): string {
  const tlvSegments: string[] = [];

  tlvSegments.push(encodeTlv('00', '01')); // Version / payload format
  tlvSegments.push(encodeTlv('01', params.merchantId));
  tlvSegments.push(encodeTlv('02', params.transactionId));
  tlvSegments.push(encodeTlv('03', formatAmount(params.amount, params.currency)));
  tlvSegments.push(encodeTlv('04', params.currency));
  tlvSegments.push(encodeTlv('05', params.merchantRef));

  if (params.tipAmount !== undefined) {
    tlvSegments.push(encodeTlv('06', formatAmount(params.tipAmount, params.currency)));
  }

  if (params.feeAmount !== undefined) {
    tlvSegments.push(encodeTlv('07', formatAmount(params.feeAmount, params.currency)));
  }

  if (params.transactionType !== undefined) {
    tlvSegments.push(encodeTlv('08', params.transactionType));
  }

  const payload = tlvSegments.join('');
  const checksum = crc16Ccitt(payload);
  return `${payload}${encodeTlv('63', checksum)}`;
}
