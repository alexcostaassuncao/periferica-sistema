import {database} from '../../../../db/raw';
import {currentUser,sameOrigin} from '../../../../lib/auth';
import {type U} from '../../../../db/tarefas';
import {isMonth,openCycle,planPreview} from '../../../../db/ciclos';

/* Gerar as tarefas do mês a partir do "O que o plano inclui".
   GET ?client=ID&month=YYYY-MM  → prévia (quantas o plano pede, quantas já existem, quantas serão criadas)
   POST {client_id, month}       → abre o ciclo do mês e cria só as que faltam (clicar de novo não duplica). */
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const gestor=(u:U|null)=>!!u&&(u.admin||u.areas.includes('gestao'));

export async function GET(req:Request){
  const u=currentUser(req) as U|null;if(!gestor(u))return json({error:'Sem acesso.'},403);
  const q=new URL(req.url).searchParams,month=q.get('month')||'';
  if(!isMonth(month))return json({error:'Mês inválido.'},400);
  if(!await database().prepare('SELECT id FROM clients WHERE id=?').bind(q.get('client')||'').first())return json({error:'Cliente não encontrado.'},404);
  return json({month,...await planPreview(q.get('client')!,month)});
}

export async function POST(req:Request){
  const u=currentUser(req) as U|null;if(!gestor(u)||!sameOrigin(req))return json({error:'Só a Gestão gera as tarefas do mês.'},403);
  const p:any=await req.json().catch(()=>({}));
  if(!isMonth(p.month))return json({error:'Mês inválido.'},400);
  if(!await database().prepare('SELECT id FROM clients WHERE id=?').bind(p.client_id).first())return json({error:'Cliente não encontrado.'},404);
  const r=await openCycle(p.client_id,p.month,u);
  if(r.noPlan)return json({error:'Defina primeiro o que o plano inclui (ficha do cliente → Serviços e contratos).'},400);
  if(!r.created)return json({created:0,message:'As tarefas deste mês já foram geradas.'});
  return json({created:r.created});
}
