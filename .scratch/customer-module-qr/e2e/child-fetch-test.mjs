import http from 'node:http';
import { execFileSync } from 'node:child_process';
const srv = http.createServer((q, s) => { s.end('ok'); });
srv.listen(0, () => {
  const port = srv.address().port;
  console.log('parent on', port);
  try {
    const out = execFileSync('node', ['-e', `fetch('http://127.0.0.1:${port}/').then(r=>r.text()).then(t=>{console.log('child fetch:',t);process.exit(0)}).catch(e=>{console.log('child fetch FAILED:',e.message,e.cause?.message??'');process.exit(1)})`], { encoding: 'utf-8' });
    console.log(out);
  } catch (e) {
    console.log('child threw:', String(e.stdout), String(e.stderr));
  }
  srv.close();
});
