// Dump folder descriptions + remaining request descriptions I haven't seen.
const fs = require('fs');
const dir = 'D:/PayWay_Postman/_build/';
const show = (f, names) => {
  const p = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
  console.log('\n===== ' + f + ' folderDesc =====\n' + p.description);
  for (const it of p.item || []) {
    if (names && !names.some(n => it.name.includes(n))) continue;
    const d = it.request && it.request.description;
    if (d) console.log('\n--- ' + it.name + ' ---\n' + d);
  }
};
show('part_06_preauth.json');
show('part_07_payout.json', ['Add Account', 'Payout']);
show('part_08_cof.json', ['1. Link', '4. Payment', '3. Get']);
show('part_05_paymentlink.json', ['Create']);
show('part_04_qr.json');
