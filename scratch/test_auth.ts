import { generateHmac, encryptMerchantAuth, verifyCallbackSignature } from '../src/auth.js';
import * as crypto from 'crypto';

console.log("Starting authentication pipeline unit checks...\n");

// 1. Test HMAC signature generation
const samplePayload = {
  req_time: "20250213065545",
  merchant_id: "ec000002",
  tran_id: "17394277693"
};
const fieldOrder = ["req_time", "merchant_id", "tran_id"];
const apiKey = "mock-api-key-123456";

const signature = generateHmac(samplePayload, fieldOrder, apiKey);
console.log("Generated HMAC (Base64):", signature);
if (signature) {
  console.log("✅ HMAC Generation Test Passed.");
} else {
  console.log("❌ HMAC Generation Test Failed.");
}

// 2. Test Callback Verification
const callbackBody = {
  tran_id: "17394277693",
  status: "APPROVED",
  apv: "619195"
};
const callbackSig = generateHmac(callbackBody, ["apv", "status", "tran_id"].sort(), apiKey);
const isCallbackValid = verifyCallbackSignature(callbackBody, callbackSig, apiKey);
console.log("Callback Verification Result:", isCallbackValid);
if (isCallbackValid) {
  console.log("✅ Callback Verification Test Passed.");
} else {
  console.log("❌ Callback Verification Test Failed.");
}

// 3. Test RSA Encryption of merchant_auth
// Generate a temp 1024-bit RSA key pair for testing
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 1024,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const merchantAuthPayload = {
  mc_id: "ec000002",
  tran_id: "123456",
  refund_amount: 10.00
};

try {
  const encrypted = encryptMerchantAuth(merchantAuthPayload, publicKey);
  console.log("Encrypted merchant_auth (Base64 length):", encrypted.length);

  // Let's verify by decrypting back
  const encryptedBuf = Buffer.from(encrypted, 'base64');
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    encryptedBuf
  );
  const decryptedData = JSON.parse(decrypted.toString('utf8'));
  console.log("Decrypted Data:", decryptedData);
  if (decryptedData.tran_id === "123456" && decryptedData.refund_amount === 10.00) {
    console.log("✅ RSA Encryption/Decryption Test Passed.");
  } else {
    console.log("❌ RSA Decrypted Data Mismatch.");
  }
} catch (err) {
  console.error("❌ RSA Encryption Test Failed with error:", err);
}

console.log("\nAll checks completed.");
