// probe_purchase_urlencoded.js — verify the sandbox accepts a plain HTML-form
// (application/x-www-form-urlencoded) purchase POST, as the Visualizer launcher sends it.
const CryptoJS = require('crypto-js');
const M = 'sonitatest', S = '9dc49bb1-04db-4ac0-a262-e7bef22cff6a';
const b64 = (s) => CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(s));
const hash = (m) => CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA512(m, S));
const p = (n) => (n < 10 ? '0' + n : '' + n);
const d = new Date();
const reqTime = '' + d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds());
const tranId = 'T' + Date.now();
const amount = '0.10';
const items = b64('[{"name":"Test Item","quantity":1,"price":0.10}]');
const shipping = '0.00';
const rurl = b64('https://example.com/return'), curl = b64('https://example.com/cancel'), csurl = b64('https://example.com/success');
const msg = reqTime + M + tranId + amount + items + shipping + 'Test' + 'User' + 'test@example.com' + '0123456789'
  + 'purchase' + 'abapay_khqr' + rurl + curl + csurl + '' + 'USD' + '' + '' + '' + '' + '3' + '' + '' + '0';
const f = new URLSearchParams({
  req_time: reqTime, merchant_id: M, tran_id: tranId, amount,
  items, shipping, firstname: 'Test', lastname: 'User', email: 'test@example.com', phone: '0123456789',
  type: 'purchase', payment_option: 'abapay_khqr', return_url: rurl, cancel_url: curl,
  continue_success_url: csurl, currency: 'USD', lifetime: '3', skip_success_page: '0',
  view_type: 'hosted_view', payment_gate: '0', hash: hash(msg),
});
(async () => {
  const res = await fetch('https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: f.toString(),
  });
  const txt = await res.text();
  const isCheckout = /PayWay - Checkout/i.test(txt);
  console.log('HTTP', res.status, '| checkout page served:', isCheckout, '| first 120 chars:', txt.replace(/\s+/g, ' ').slice(0, 120));
})();
