import {database} from '../../../db/raw';
import {canAccess,currentUser} from '../../../lib/auth';
import type {U} from '../../../db/tarefas';
import {COMP,isMonth,meetingWindow,syncCycles} from '../../../db/ciclos';

/* Gestão por competência (mês). Cada mês é independente: a pendência de outubro continua em outubro
   e aparece em "Pendências anteriores" — não muda o que foi contratado para o mês seguinte.
   GET ?month=YYYY-MM → clientes da carteira com o progresso do mês, atividades por responsável e pendências anteriores.
   Respeita a regra de carteira (consultora vê só as suas; gestor/admin vê todas). */
export async function GET(req:Request){
  const u=currentUser(req) as U|null;
  if(!u||!canAccess(req,'gestao'))return Response.json({error:'Você não tem acesso à Gestão.'},{status:403});
  const db=database(),hoje=new Date().toISOString().slice(0,10);
  const qm=new URL(req.url).searchParams.get('month')||'';
  const month=isMonth(qm)?qm:hoje.slice(0,7);
  await syncCycles(month);
  const vis=u.admin||!u.squads.length?{sql:'1=1',args:[] as any[]}:{sql:`(COALESCE(c.squad,'')='' OR c.squad IN (${u.squads.map(()=>'?').join(',')}) OR EXISTS (SELECT 1 FROM client_team ct WHERE ct.client_id=c.id AND ct.user_id=?))`,args:[...u.squads,u.id]};
  const clients=(await db.prepare(`SELECT c.id,c.name,c.segment,c.squad,c.status,c.phase,c.services,
      (SELECT t.user_id FROM client_team t WHERE t.client_id=c.id AND t.role='consultora') AS consultora_id,
      (SELECT u.name FROM client_team t JOIN users u ON u.id=t.user_id WHERE t.client_id=c.id AND t.role='consultora') AS consultora,
      (SELECT k.model FROM contracts k WHERE k.client_id=c.id AND k.status='assin' ORDER BY k.signed_at DESC LIMIT 1) AS plano,
      (SELECT k.value FROM contracts k WHERE k.client_id=c.id AND k.status='assin' ORDER BY k.signed_at DESC LIMIT 1) AS plano_valor,
      y.status AS cycle_status,y.planning_done_at,y.closed_at AS cycle_closed_at,
      (SELECT m.date||' '||m.start_time||'|'||m.title FROM meetings m WHERE m.client_id=c.id AND m.date>=? ORDER BY m.date,m.start_time LIMIT 1) AS proxima
    FROM clients c LEFT JOIN client_cycles y ON y.client_id=c.id AND y.month=?
    WHERE (c.phase IN ('gestao','onboarding') OR y.id IS NOT NULL OR EXISTS (SELECT 1 FROM tasks t WHERE t.client_id=c.id AND ${COMP}=?)) AND ${vis.sql}
    ORDER BY c.name`).bind(hoje,month,month,...vis.args).all()).results as any[];
  const ids=clients.map(c=>c.id);
  const inIds=ids.length?`t.client_id IN (${ids.map(()=>'?').join(',')})`:'1=0';
  const names=Object.fromEntries(((await db.prepare('SELECT id,name FROM users').all()).results as any[]).map(p=>[p.id,p.name]));names.admin='Administrador';
  // Entregas da competência
  const tasks=(await db.prepare(`SELECT t.id,t.client_id,t.title,t.stage,t.client_status,t.category,t.due_date,t.publish_date,t.required,t.assignee_id,t.responsible_id,
      EXISTS (SELECT 1 FROM publications p JOIN publication_targets pt ON pt.publication_id=p.id WHERE p.task_id=t.id AND pt.status='published') AS publicada,
      EXISTS (SELECT 1 FROM publications p WHERE p.task_id=t.id) AS agendada
    FROM tasks t WHERE ${inIds} AND ${COMP}=?`).bind(...ids,month).all()).results as any[];
  // Pendências de meses anteriores (qualquer competência), sem misturar com o mês escolhido
  const pend=(await db.prepare(`SELECT t.id,t.client_id,t.title,t.stage,t.client_status,t.category,t.due_date,t.assignee_id,${COMP} AS comp
    FROM tasks t WHERE ${inIds} AND ${COMP}<? AND ${COMP}<>'' AND t.stage<>'aprovada' ORDER BY comp,t.due_date LIMIT 500`).bind(...ids,month).all()).results as any[];
  const late=(t:any)=>t.stage!=='aprovada'&&t.due_date&&t.due_date<hoje;
  const pendBy=new Map<string,number>();for(const t of pend)pendBy.set(t.client_id,(pendBy.get(t.client_id)||0)+1);
  const out=clients.map(c=>{
    const T=tasks.filter(t=>t.client_id===c.id),R=T.filter(t=>t.required);
    const base=R.length?R:T; // % considera as entregas obrigatórias do plano; sem plano, todas as do mês
    const done=base.filter(t=>t.stage==='aprovada').length;
    return {...c,
      total:base.length,done,pct:base.length?Math.round(done/base.length*100):0,
      concluido:c.cycle_status==='concluido'||(base.length>0&&done===base.length),
      abertas:T.filter(t=>t.stage!=='aprovada').length,
      atrasadas:T.filter(late).length,
      producao:T.filter(t=>['gestao','copy','video','design'].includes(t.stage)).length,
      revisao:T.filter(t=>t.stage==='revisao').length,
      ajustes:T.filter(t=>t.client_status==='ajustes'&&t.stage!=='aprovada').length,
      cliente:T.filter(t=>t.stage==='cliente').length,
      aprovadas:T.filter(t=>t.stage==='aprovada').length,
      publicadas:T.filter(t=>t.publicada).length,
      pend_ant:pendBy.get(c.id)||0,
    };
  });
  // Atividades pendentes por responsável (quem está com a tarefa agora)
  const resp=new Map<string,{id:string;name:string;abertas:number;atrasadas:number}>();
  for(const t of tasks.filter(x=>x.stage!=='aprovada')){
    const k=t.assignee_id||'';const r=resp.get(k)||{id:k,name:names[k]||(k?'—':'Sem responsável'),abertas:0,atrasadas:0};
    r.abertas++;if(late(t))r.atrasadas++;resp.set(k,r);
  }
  const cname=Object.fromEntries(clients.map(c=>[c.id,c.name]));
  return Response.json({month,window:meetingWindow(month),clients:out,
    tasks:tasks.map(t=>({...t,client_name:cname[t.client_id],assignee_name:names[t.assignee_id]||''})),
    byResponsible:[...resp.values()].sort((a,b)=>b.abertas-a.abertas),
    pendencias:pend.map(t=>({...t,client_name:cname[t.client_id],assignee_name:names[t.assignee_id]||''}))},
    {headers:{'Cache-Control':'no-store'}});
}
