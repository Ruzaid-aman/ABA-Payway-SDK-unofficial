import { PayWay, PayWayConfigError } from '../dist/index.js';
import * as crypto from 'crypto';

console.log("Starting SDK Smoke Tests...\n");

// 1. Config Validation Test
try {
  new PayWay({ merchantId: '', apiKey: '' });
  console.log("❌ Config validation test failed (should have thrown)");
} catch (e) {
  if (e instanceof PayWayConfigError) {
    console.log("✅ Config validation test passed (correctly rejected empty credentials)");
  } else {
    console.log("❌ Config validation test failed with wrong error:", e);
  }
}

// 2. Class Instantiation & environment mapping
const { publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 1024,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const pw = new PayWay({
  merchantId: 'ec000002',
  apiKey: 'mock-key-123',
  publicKeyPem: publicKey,
  environment: 'sandbox',
});
console.log("✅ Class instantiated successfully");

// 3. createTransaction formatting & hashing test
const txPayload = pw.checkout.createTransaction({
  transactionId: 'order-001',
  amount: 12.5,
  currency: 'USD',
  items: [{ name: 'Widget', quantity: 1, price: 12.5 }],
  returnUrl: 'https://example.com/callback',
});

console.log("Generated transaction payload:", txPayload);
if (txPayload.tran_id === 'order-001' && 
    txPayload.amount === '12.50' && 
    txPayload.currency === 'USD' && 
    txPayload.items === 'W3sibmFtZSI6IldpZGdldCIsInF1YW50aXR5IjoxLCJwcmljZSI6MTIuNX1d' && // base64 encoded items
    txPayload.hash) {
  console.log("✅ createTransaction mapping, amount formatting, base64 items, and hashing tests passed.");
} else {
  console.log("❌ createTransaction tests failed.");
}

// 4. verifyCallback test
const cbSig = txPayload.hash;
const isValid = pw.verifyCallback({ ...txPayload, hash: undefined }, cbSig);
console.log("Callback signature verification result:", isValid);

console.log("\nAll smoke tests complete.");
