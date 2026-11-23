import {runDue} from '../../../../db/publish';
import {database} from '../../../../db/raw';
import {cronAuthorized as authorized} from '../../../../lib/cron';

// Chamado a cada 5 minutos pelo agendador (GitHub Actions: .github/workflows/publicacoes-agendadas.yml).
// Protegido pela chave CRON_SECRET, enviada no cabeçalho Authorization: Bearer <chave>.
export const maxDuration=60;
async function run(req:Request){
  if(!authorized(req))return Response.json({error:'Não autorizado.'},{status:401});
  await database().prepare("INSERT INTO app_state (id,payload) VALUES ('publication-scheduler',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").bind(new Date().toISOString()).run();
  return Response.json({processed:await runDue()});
}
export const GET=run;
export const POST=run;
