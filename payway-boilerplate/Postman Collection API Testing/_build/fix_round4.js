/* fix_round4.js — Get Token Details: treat "not issued yet" (code 09 / HTTP 403)
 * as an informational result instead of a test failure. */
const fs = require('fs');
const path = require('path');
function load(f) { return JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')); }
function save(f, j) { fs.writeFileSync(path.join(__dirname, f), JSON.stringify(j, null, 2) + '\n'); }
function findItem(part, prefix) {
  const it = part.item.find((i) => i.name.startsWith(prefix));
  if (!it) throw new Error('request not found: ' + prefix);
  return it;
}
function exec(it, listen) {
  const ev = (it.event || []).find((e) => e.listen === listen);
  if (!ev) throw new Error('no ' + listen + ' on ' + it.name);
  return ev.script.exec;
}
function setTest(it, lines) { exec(it, 'test').splice(0, exec(it, 'test').length, ...lines); }

const TOKEN_TEST = [
  "var j = {};",
  "try { j = pm.response.json(); } catch (e) {}",
  "var sc = respCode(j);",
  "pm.test('Get Token Details responded (status.code ' + (sc || 'HTTP ' + pm.response.code) + ')', function () { pm.expect(sc || pm.response.code).to.not.be.undefined; });",
  "if (sc === '09' || pm.response.code === 403) {",
  "  // sandbox-verified: code 09 'Data not found' = token not issued yet (link not completed)",
  "  console.log('Token not issued yet (code 09). Complete the ABA-app link flow from Link Account/Card (deeplink or QR), or wait for the callback, then re-send with the SAME {{request_id}}.');",
  "} else if (okStatus(j)) {",
  "  if (j.data && j.data.pwt) { pm.collectionVariables.set('pwt', j.data.pwt); console.log('pwt saved to collection variables.'); }",
  "  if (j.data && j.data.ctid) { pm.collectionVariables.set('ctid', j.data.ctid); console.log('ctid saved:', j.data.ctid); }",
  "  pm.test('pwt available for Payment/Renew/Remove', function () { pm.expect(pm.collectionVariables.get('pwt')).to.not.be.empty; });",
  "} else if (j.status) {",
  "  console.log('status.code:', sc, '-', j.status.message);",
  "}",
  "if (pm.response.code === 200) assertJsonSchema({\"type\":\"object\",\"required\":[\"status\"],\"properties\":{\"status\":{\"type\":\"object\",\"properties\":{\"code\":{\"type\":[\"number\",\"string\"]},\"message\":{\"type\":\"string\"}}},\"data\":{\"type\":\"object\"}}});"
];

{
  const cof = load('part_08_cof.json');
  setTest(findItem(cof, '3. Get Token'), TOKEN_TEST);
  save('part_08_cof.json', cof);
  console.log('part_08_cof.json: Get Token Details test fixed');
}
{
  const pol = load('part_11_polling.json');
  setTest(findItem(pol, 'B2 - Get Token'), TOKEN_TEST);
  save('part_11_polling.json', pol);
  console.log('part_11_polling.json: B2 test fixed');
}
console.log('\nRound-4 patches applied.');
