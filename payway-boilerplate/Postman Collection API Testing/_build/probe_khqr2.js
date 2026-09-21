const CryptoJS = require('crypto-js');
const S = '74633d0e-236f-4271-af8b-17c2b4c6e3f8', M = 'sonitatestinstore';
const h = (m) => CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA512(m, S));
const p = (n) => (n < 10 ? '0' + n : '' + n);
const d = new Date();
const rt = '' + d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds());
const B = 'https://checkout-sandbox.payway.com.kh';
(async () => {
  const paths = [
    '/api/payment-gateway/v1/payments/get-transactions-by-mc-ref',
    '/api/payment-gateway/v1/payments/get-transaction-by-mc-ref',
    '/api/payment-gateway/v1/payments/get-transactions-mc-ref',
  ];
  for (const path of paths) {
    const body = { req_time: rt, merchant_id: M, merchant_ref: 'TEST', hash: h(rt + M + 'TEST') };
    const r = await fetch(B + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const t = await r.text();
    console.log(path, '-> HTTP', r.status, 'len', t.length, ':', t.slice(0, 220));
  }
})();
