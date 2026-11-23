import {runMonthly} from '../../../../db/ciclos';
import {cronAuthorized} from '../../../../lib/cron';

// Chamado uma vez por dia pelo agendador (.github/workflows/ciclos-mensais.yml).
// Garante aberto o ciclo do mês seguinte e, a partir do dia 20, o do segundo mês seguinte, com as entregas do plano.
// Rodar mais de uma vez no mesmo dia não duplica nada.
export const maxDuration=60;
async function run(req:Request){
  if(!cronAuthorized(req))return Response.json({error:'Não autorizado.'},{status:401});
  return Response.json({months:await runMonthly()});
}
export const GET=run;
export const POST=run;
