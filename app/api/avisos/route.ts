import {database} from '../../../db/raw';
import {currentUser} from '../../../lib/auth';
import {visibilitySql,type U} from '../../../db/tarefas';

// Painel de avisos (sininho): o que precisa da atenção desta pessoa agora.
// level: alerta (conta no número do sininho) · info (dica, não conta)
type Aviso={level:'alerta'|'info';icon:string;title:string;body:string;href:string};

export async function GET(req:Request){
  const u=currentUser(req) as U|null;
  if(!u)return Response.json({error:'Sem sessão.'},{status:401});
  const db=database(),hoje=new Date().toISOString().slice(0,10),now=Date.now();
  const has=(a:string)=>u.admin||u.areas.includes(a);
  const out:Aviso[]=[];
  const page=(stage:string)=>({copy:'copy.html',design:'design.html',revisao:'revisao.html',cliente:'revisao.html'} as any)[stage]||'gestao.html';
  const tasksOn=['gestao','copy','design','revisao'].some(has);

  if(tasksOn){
    const vis=visibilitySql(u);
    // Tarefas comigo e atrasadas
    const late=(await db.prepare(`SELECT t.id,t.title,t.stage,t.due_date,c.name AS client FROM tasks t JOIN clients c ON c.id=t.client_id
      WHERE t.assignee_id=? AND t.stage NOT IN ('aprovada','cliente') AND t.due_date<>'' AND t.due_date<? AND ${vis.sql} ORDER BY t.due_date LIMIT 20`).bind(u.id,hoje,...vis.args).all()).results as any[];
    for(const t of late)out.push({level:'alerta',icon:'alarm-clock',title:`Atrasada: ${t.title}`,body:`${t.client} · prazo era ${t.due_date.split('-').reverse().join('/')}`,href:`${page(t.stage)}?tarefa=${t.id}`});
    // Voltaram para mim com ajuste
    const adj=(await db.prepare(`SELECT t.id,t.title,t.stage,c.name AS client,(SELECT reason FROM task_history h WHERE h.task_id=t.id AND h.action='ajuste' ORDER BY created_at DESC LIMIT 1) AS reason
      FROM tasks t JOIN clients c ON c.id=t.client_id WHERE t.assignee_id=? AND t.stage IN ('copy','design')
      AND (SELECT action FROM task_history h WHERE h.task_id=t.id ORDER BY created_at DESC LIMIT 1)='ajuste' AND ${vis.sql} LIMIT 20`).bind(u.id,...vis.args).all()).results as any[];
    for(const t of adj)out.push({level:'alerta',icon:'rotate-ccw',title:`Ajuste pedido: ${t.title}`,body:`${t.client} · ${String(t.reason||'').slice(0,90)}`,href:`${page(t.stage)}?tarefa=${t.id}`});
    // Cliente pediu ajustes (Revisão)
    if(has('revisao')){
      const ca=(await db.prepare(`SELECT t.id,t.title,t.client_feedback,c.name AS client FROM tasks t JOIN clients c ON c.id=t.client_id WHERE t.stage='revisao' AND t.client_status='ajustes' AND ${vis.sql} LIMIT 20`).bind(...vis.args).all()).results as any[];
      for(const t of ca)out.push({level:'alerta',icon:'message-square-warning',title:`Cliente pediu ajustes: ${t.title}`,body:`${t.client} · ${String(t.client_feedback||'').slice(0,90)}`,href:`revisao.html?tarefa=${t.id}`});
      const wait=(await db.prepare(`SELECT t.id,t.title,c.name AS client FROM tasks t JOIN clients c ON c.id=t.client_id WHERE t.stage='cliente' AND t.updated_at<? AND ${vis.sql} LIMIT 20`).bind(now-3*86400000,...vis.args).all()).results as any[];
      for(const t of wait)out.push({level:'alerta',icon:'hourglass',title:`Cliente sem responder há 3+ dias: ${t.title}`,body:t.client,href:`revisao.html?tarefa=${t.id}`});
    }
    // @menções nos últimos 7 dias
    const men=(await db.prepare(`SELECT m.task_id,m.author_name,m.body,t.title,t.stage FROM task_comments m JOIN tasks t ON t.id=m.task_id WHERE m.mentions LIKE ? AND m.created_at>? ORDER BY m.created_at DESC LIMIT 15`)
      .bind(`%"${u.id}"%`,now-7*86400000).all()).results as any[];
    for(const m of men)out.push({level:'alerta',icon:'at-sign',title:`${m.author_name} mencionou você em "${m.title}"`,body:String(m.body).slice(0,100),href:`${page(m.stage)}?tarefa=${m.task_id}`});
  }
  if(has('onboarding')){
    const obs=(await db.prepare(`SELECT o.id,c.name FROM onboardings o JOIN clients c ON c.id=o.client_id WHERE o.status='andamento' AND o.due_at<?`).bind(now).all()).results as any[];
    for(const o of obs)out.push({level:'alerta',icon:'list-checks',title:`Onboarding atrasado: ${o.name}`,body:'Passou do prazo de 10 dias úteis.',href:`onboarding.html?id=${o.id}`});
  }
  // Para quem organiza a carteira: clientes sem carteira ou sem consultora
  if(u.admin||has('equipe')||has('clientes')){
    const semCart=(await db.prepare(`SELECT id,name FROM clients WHERE status='ativo' AND COALESCE(squad,'')='' AND phase IN ('onboarding','gestao') ORDER BY name LIMIT 20`).all()).results as any[];
    for(const c of semCart)out.push({level:'alerta',icon:'folder-x',title:`Sem carteira: ${c.name}`,body:'Defina a carteira para o cliente aparecer para o time certo.',href:`clientes.html?id=${c.id}`});
    const semCons=(await db.prepare(`SELECT id,name FROM clients c WHERE status='ativo' AND phase='gestao' AND NOT EXISTS (SELECT 1 FROM client_team t WHERE t.client_id=c.id AND t.role='consultora') ORDER BY name LIMIT 20`).all()).results as any[];
    for(const c of semCons)out.push({level:'alerta',icon:'user-x',title:`Sem consultora: ${c.name}`,body:'Defina a consultora na ficha do cliente (aba Equipe).',href:`clientes.html?id=${c.id}`});
  }
  // Dicas
  if(!u.admin&&u.squads.length)out.push({level:'info',icon:'info',title:`Você vê os clientes da${u.squads.length>1?'s':''} carteira${u.squads.length>1?'s':''} ${u.squads.join(', ')}`,
    body:'Se um cliente não aparece para você, verifique com o administrador se ele está na sua carteira ou se você está na equipe dele.',href:''});
  return Response.json({avisos:out,total:out.filter(a=>a.level==='alerta').length},{headers:{'Cache-Control':'no-store'}});
}
