// Cria/atualiza as tabelas do banco aplicando os arquivos migrations/*.sql que ainda não foram aplicados.
// Roda automaticamente antes de cada build (npm run build) e no npm run dev.
import {createClient} from '@libsql/client';
import {readdir,readFile} from 'node:fs/promises';

const url=process.env.TURSO_DATABASE_URL;
if(!url&&process.env.VERCEL){
  console.error('\n✖ TURSO_DATABASE_URL não está definida na Vercel (Settings → Environment Variables).\n');
  process.exit(1);
}
const db=createClient({url:url||'file:periferica-local.db',authToken:process.env.TURSO_AUTH_TOKEN||undefined});

await db.execute('CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY NOT NULL, applied_at text NOT NULL)');
const applied=new Set((await db.execute('SELECT name FROM _migrations')).rows.map(r=>r.name));
const files=(await readdir(new URL('../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort();

let count=0;
for(const file of files){
  if(applied.has(file))continue;
  const sql=await readFile(new URL('../migrations/'+file,import.meta.url),'utf8');
  const statements=sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
  // Cada arquivo é aplicado numa transação: ou entra inteiro, ou nada muda.
  await db.batch([...statements,{sql:'INSERT INTO _migrations (name,applied_at) VALUES (?,?)',args:[file,new Date().toISOString()]}],'write');
  console.log('✔ migração aplicada:',file);count++;
}
console.log(count?`Banco atualizado (${count} migração(ões)).`:'Banco já está atualizado.');
db.close();
