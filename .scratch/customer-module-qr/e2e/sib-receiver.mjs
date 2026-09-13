import http from 'node:http';
const srv = http.createServer((q, s) => { s.end('ok'); });
srv.listen(0, '127.0.0.1', () => console.log('PORT:' + srv.address().port));
