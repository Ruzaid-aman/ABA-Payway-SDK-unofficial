import { mkdirSync, mkdtempSync, cpSync, writeFileSync, symlinkSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
const dependencies = process.argv[2];
const root = mkdtempSync(path.join(path.dirname(dependencies), 'next-runtime-'));
mkdirSync(root, {recursive:true});
if (!existsSync(path.join(root,'node_modules'))) symlinkSync(path.join(dependencies,'node_modules'),path.join(root,'node_modules'),'junction');
cpSync(path.join(dependencies,'node_modules/aba-payway-ts/skills/aba-payway-integration/assets'),path.join(root,'recipes'),{recursive:true});
// Follow the documented Next.js bundler adaptation of local TypeScript imports.
for (const file of readdirSync(path.join(root,'recipes'))) {
  const target=path.join(root,'recipes',file);
  writeFileSync(target,readFileSync(target,'utf8').replace(/from '(\.\/[^']+)\.js'/g,"from '$1'"));
}
const save=(name,text)=>{mkdirSync(path.dirname(path.join(root,name)),{recursive:true});writeFileSync(path.join(root,name),text);};
save('package.json',JSON.stringify({private:true,type:'module',scripts:{build:'next build'}},null,2));
save('next.config.mjs',"import path from 'node:path';\nexport default {turbopack:{root:path.resolve('..')}};\n");
save('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'Bundler',strict:true,skipLibCheck:true,jsx:'react-jsx',noEmit:true,esModuleInterop:true},include:['**/*.ts','**/*.tsx'],exclude:['node_modules']},null,2));
save('app/layout.tsx',"export default function Layout({children}:{children:React.ReactNode}) { return <html><body>{children}</body></html>; }\n");
save('app/page.tsx',"export default function Page() { return <main>Simulated payment recipe validation</main>; }\n");
save('merchant.ts',`import {existsSync} from 'node:fs';
import {createIntegration} from './recipes/service';
import {SqliteStore} from './recipes/sqlite-store';
import {nextIntegration} from './recipes/next';
const store=new SqliteStore(process.env.PAYWAY_RECIPE_DB||':memory:');
for(const route of ['qr','hosted','link']) {
  const id=route+'-order';
  if(!store.db.prepare('SELECT id FROM orders WHERE id=?').get(id))
    store.seed({id,ownerId:'alice',amountMinor:300,currency:'USD'});
}
const service=createIntegration(store,{async create(a){return {artifact:{kind:a.route,qrString:'simulated',html:'<form method="POST"></form>',url:'https://example.invalid'},linkId:'synthetic-link'};},async lookup(a){return {identity:a.attemptId,status:process.env.PAYWAY_RECIPE_PAID_MARKER&&existsSync(process.env.PAYWAY_RECIPE_PAID_MARKER)?'APPROVED':'PENDING',amount:3,currency:'USD'};}},'synthetic-key');
export const handlers=nextIntegration(service,async req=>req.headers.get('x-demo-user')||undefined);
// Synthetic test-only scheduled worker; production needs shared leases/budgets.
const worker=setInterval(()=>{for(const id of store.pending())void service.reconcile(id,'alice').catch(()=>{});},100);
worker.unref();
`);
for(const route of ['qr','hosted','link','callback']) save('app/api/payments/'+route+'/route.ts',"import {handlers} from '../../../../merchant';\nexport const runtime='nodejs';\nexport const POST="+(route==='callback'?'handlers.callback':"handlers.create('"+route+"')")+";\n");
save('app/api/payments/status/[id]/route.ts',"import {handlers} from '../../../../../merchant';\nexport const runtime='nodejs';\nexport async function GET(req:Request,{params}:{params:Promise<{id:string}>}) {return handlers.status(req,(await params).id);}\n");
console.log(root);
