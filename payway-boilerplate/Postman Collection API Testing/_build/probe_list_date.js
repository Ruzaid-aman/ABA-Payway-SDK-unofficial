// probe_list_date.js — find the date format sandbox accepts for transaction-list-2
const CryptoJS = require('crypto-js');
const BASE = 'https://checkout-sandbox.payway.com.kh';
const M = 'sonitatest';
const S = '9dc49bb1-04db-4ac0-a262-e7bef22cff6a';
const hash = (msg) => CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA512(msg, S));

const variants = [
  { label: 'compact yyyymmdd', from: '20260918', to: '20260918' },
  { label: 'datetime', from: '2026-09-18 00:00:00', to: '2026-09-18 23:59:59' },
  { label: 'iso', from: '2026-09-18', to: '2026-09-18', extra: { from_amount: '0', to_amount: '999999' } },
];

(async () => {
  for (const v of variants) {
    const reqTime = '20260918154100'; // fixed not required; server checks recency? use fresh
    const rt = new Date();
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    const req_time = '' + rt.getUTCFullYear() + p(rt.getUTCMonth() + 1) + p(rt.getUTCDate()) + p(rt.getUTCHours()) + p(rt.getUTCMinutes()) + p(rt.getUTCSeconds());
    const body = {
      req_time,
      merchant_id: M,
      from_date: v.from,
      to_date: v.to,
      from_amount: (v.extra && v.extra.from_amount) || '',
      to_amount: (v.extra && v.extra.to_amount) || '',
      status: '',
      page: '1',
      pagination: '20',
    };
    const msg = req_time + M + body.from_date + body.to_date + body.from_amount + body.to_amount + body.status + body.page + body.pagination;
    body.hash = hash(msg);
    const res = await fetch(BASE + '/api/payment-gateway/v1/payments/transaction-list-2', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const txt = await res.text();
    console.log('--- ' + v.label + ' (' + v.from + ') HTTP ' + res.status + ': ' + txt.slice(0, 200));
  }
})();
