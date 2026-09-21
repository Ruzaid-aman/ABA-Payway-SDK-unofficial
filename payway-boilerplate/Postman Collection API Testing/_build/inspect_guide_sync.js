// How is the collection description stored / synced with get_started.md?
const fs = require('fs');
const info = JSON.parse(fs.readFileSync('D:/PayWay_Postman/_build/part_00_info.json', 'utf8'));
console.log('info keys:', Object.keys(info));
const desc = info.info && info.info.description;
console.log('description typeof:', typeof desc);
const content = typeof desc === 'string' ? desc : desc.content;
console.log('description length:', content.length);
console.log('first 300:', JSON.stringify(content.slice(0, 300)));
const md = fs.readFileSync('D:/PayWay_Postman/_build/get_started.md', 'utf8');
console.log('md length:', md.length);
console.log('identical to md:', content.trim() === md.trim());
console.log('md first 300:', JSON.stringify(md.slice(0, 300)));
// any build step that reads get_started.md?
const files = fs.readdirSync('D:/PayWay_Postman/_build').filter(f => f.endsWith('.js'));
for (const f of files) {
  const s = fs.readFileSync('D:/PayWay_Postman/_build/' + f, 'utf8');
  if (s.includes('get_started')) console.log('references get_started.md:', f);
}
