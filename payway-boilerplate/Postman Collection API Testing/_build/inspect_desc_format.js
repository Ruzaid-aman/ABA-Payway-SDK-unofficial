// Inspect part_03 description storage format.
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('D:/PayWay_Postman/_build/part_03_ecom.json', 'utf8'));
console.log('part keys:', Object.keys(p));
console.log('items:', p.item.length);
const it = p.item[0];
console.log('req name:', it.name);
console.log('req keys:', Object.keys(it));
console.log('desc typeof:', typeof it.request.description);
console.log('desc JSON:', JSON.stringify(it.request.description).slice(0, 300));
console.log('desc of item 3 (' + p.item[3].name + '):', JSON.stringify(p.item[3].request.description).slice(0, 300));
console.log('desc of item 6 (' + p.item[6].name + '):', JSON.stringify(p.item[6].request.description).slice(0, 300));
// how does merge.js write descriptions?
const merge = fs.readFileSync('D:/PayWay_Postman/_build/merge.js', 'utf8');
console.log('\nmerge.js mentions description:', merge.includes('description'));
