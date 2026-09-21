const CryptoJS = require('crypto-js');
const S = '9dc49bb1-04db-4ac0-a262-e7bef22cff6a', M = 'sonitatest';
const h = (m) => CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA512(m, S));
const p = (n) => (n < 10 ? '0' + n : '' + n);
const d = new Date();
const rt = '' + d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds());
(async () => {
  for (const ref of ['MREF-0001', 'TEST', '17394277693']) {
    const body = { req_time: rt, merchant_id: M, merchant_ref: ref, hash: h(rt + M + ref) };
    const r = await fetch('https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/get-transactions-by-mc-ref', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const t = await r.text();
    console.log(ref, '-> HTTP', r.status, 'len', t.length, ':', t.slice(0, 200));
  }
  const r2 = await fetch('https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/get-transactions-by-mc-refX', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  console.log('bogus path -> HTTP', r2.status);
})();
