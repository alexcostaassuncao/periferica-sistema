import {runDue} from '../../../../db/publish';
import {database} from '../../../../db/raw';

// Chamado a cada 5 minutos pelo agendador (GitHub Actions: .github/workflows/publicacoes-agendadas.yml).
// Protegido pela chave CRON_SECRET, enviada no cabeçalho Authorization: Bearer <chave>.
export const maxDuration=60;
function authorized(req:Request){
  const secret=process.env.CRON_SECRET||'';
  const sent=req.headers.get('Authorization')||'';
  const expected='Bearer '+secret;
  if(secret.length<16||sent.length!==expected.length)return false;
  let diff=0;for(let i=0;i<sent.length;i++)diff|=sent.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
async function run(req:Request){
  if(!authorized(req))return Response.json({error:'Não autorizado.'},{status:401});
  await database().prepare("INSERT INTO app_state (id,payload) VALUES ('publication-scheduler',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").bind(new Date().toISOString()).run();
  return Response.json({processed:await runDue()});
}
export const GET=run;
export const POST=run;
