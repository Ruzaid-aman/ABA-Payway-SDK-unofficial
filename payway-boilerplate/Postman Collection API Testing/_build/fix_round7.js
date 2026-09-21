/*
 * fix_round7.js — Get Started experience:
 *  - collection info.description = get_started.md (renders in Postman's Overview tab)
 *  - folder 01 renamed "01 - Get Started & Test Cards", description = sidebar walkthrough
 *  - "Setup Guide" item renamed "0. Get Started (60-second walkthrough)" with steps
 */
const fs = require('fs');
const path = require('path');

function load(f) { return JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')); }
function save(f, j) { fs.writeFileSync(path.join(__dirname, f), JSON.stringify(j, null, 2) + '\n'); }

const guide = fs.readFileSync(path.join(__dirname, 'get_started.md'), 'utf8').replace(/\r\n/g, '\n').trim();

// ---------- part_00: overview = guide ----------
{
  const info = load('part_00_info.json');
  if (!info.info.description.includes('Sandbox test cards')) throw new Error('expected old README marker missing');
  info.info.description = guide;
  save('part_00_info.json', info);
  console.log('part_00_info.json: Overview description replaced with Get Started guide (' + guide.length + ' chars)');
}

// ---------- part_01: sidebar get-started ----------
{
  const setup = load('part_01_setup.json');
  if (setup.folder !== '01 - Setup & Test Cards') throw new Error('unexpected folder name: ' + setup.folder);
  setup.folder = '01 - Get Started & Test Cards';
  setup.description = [
    '## Get started here',
    '',
    '**60-second tour:** open **03 - Ecommerce Checkout → 1. Purchase** → **Send** → **Visualize tab** → click **Open payment page →** → pay with a test card below → back here, send **Check Transaction** → APPROVED.',
    '',
    'The full guide lives on the collection **Overview** tab (click the collection name). Nothing needs configuring — the public sandbox demo merchant is pre-filled.',
    '',
    'This folder: test cards, endpoints reference, and the docs links.',
  ].join('\n');

  const guide1 = setup.item.find((i) => i.name === 'Setup Guide');
  if (!guide1) throw new Error('Setup Guide item not found');
  guide1.name = '0. Get Started (60-second walkthrough)';
  guide1.request.description = [
    '## 60-second walkthrough (zero setup)',
    '',
    '1. **03 - Ecommerce Checkout → 1. Purchase (Hosted Checkout)** → **Send**.',
    '2. Open the **Visualize** tab → click **Open payment page →** (form-POSTs the signed fields; the page is served by PayWay itself).',
    '3. Pay with a sandbox test card:',
    '',
    '   | Card | Number | Expiry | CVV |',
    '   |---|---|---|---|',
    '   | ✅ Success | `4286 0900 0000 0206` | 04/30 | 777 |',
    '   | ❌ Declined | `5156 8302 7256 1029` | 04/30 | 777 |',
    '',
    '4. Back in Postman: **3. Check Transaction** → `payment_status_code: 0 (APPROVED)`.',
    '',
    '**What happened automatically:** the hash was signed (`b4hash:` in the Console), the response saved `{{last_tran_id}}`, and the Visualizer rendered the merchant-style launcher.',
    '',
    'Next stops: **Flow A** (folder 11) for KHQR + polling, **08** for saved tokens, **10** for callbacks. Full guide: collection **Overview** tab.',
  ].join('\n');

  save('part_01_setup.json', setup);
  console.log('part_01_setup.json: folder renamed + sidebar walkthrough');
}

console.log('\nRound-7 patches applied.');
