import {database} from './raw';
import {logEvent} from './clientes';
import {deliverablesOf,monthTotals,weeksOf} from './entregas';

/* Ciclo mensal (competência YYYY-MM) de cada cliente.
   - Todo dia 20 abre o ciclo do SEGUNDO mês seguinte (20/11 → janeiro). Reuniões de planejamento: do dia 20 ao dia 10 do mês seguinte.
   - Abrir o ciclo gera as entregas que o plano contratado pede (obrigatórias, required=1). Nunca duplica.
   - Cada entrega fica presa à sua competência: pendência de outubro continua sendo de outubro.
   - O ciclo só é concluído quando TODAS as entregas obrigatórias daquele mês estão finalizadas (aprovadas). */

type Who={id:string;name:string}|null;
export const MES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const FORMAT:Record<string,string>={social:'feed',campanha:'feed',video_organico:'reels',video_campanha:'reels'};
const iso=(d:Date)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
export const isMonth=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export function addMonths(month:string,n:number){const [y,m]=month.split('-').map(Number);const d=new Date(y,m-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
export const monthLabel=(month:string)=>`${MES[+month.slice(5)-1]} de ${month.slice(0,4)}`;
// Competência da tarefa: o mês do plano; tarefas avulsas (sem plano) contam no mês do prazo.
export const COMP="COALESCE(NULLIF(t.plan_month,''),substr(t.due_date,1,7))";
// Janela de reuniões de planejamento do ciclo: dia 20 de (mês-2) até dia 10 de (mês-1).
export function meetingWindow(month:string){return {from:addMonths(month,-2)+'-20',to:addMonths(month,-1)+'-10'};}

// Prazo sugerido: sexta-feira da semana de produção em que a peça cai.
function prazos(month:string,weeks:number,qty:number,freq:string,total:number){
  const [y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate(),mondays:Date[]=[];
  for(let d=1;d<=last;d++){const x=new Date(y,m-1,d);if(x.getDay()===1)mondays.push(x);}
  const out:string[]=[];
  for(let i=0;i<total;i++){
    const k=Math.min(freq==='semana'?Math.floor(i/Math.max(qty,1)):Math.floor(i*weeks/Math.max(total,1)),mondays.length-1);
    const f=new Date(mondays[k]);f.setDate(f.getDate()+4);
    out.push(iso(f.getMonth()===m-1?f:new Date(y,m-1,last)));
  }
  return out;
}

// Prévia: quantas entregas o plano pede no mês, quantas já existem e quantas faltam criar.
export async function planPreview(clientId:string,month:string){
  const db=database();
  const items=await deliverablesOf(clientId),w=await weeksOf(month);
  const totals=monthTotals(items,w.weeks);
  const ex=((await db.prepare('SELECT category,COUNT(*) n FROM tasks WHERE client_id=? AND plan_month=? GROUP BY category').bind(clientId,month).all()).results as any[]);
  const has=Object.fromEntries(ex.map(r=>[r.category,Number(r.n)]));
  return {weeks:w.weeks,rows:totals.map((t:any)=>({...t,existing:has[t.key]||0,create:Math.max(0,t.total-(has[t.key]||0))}))};
}

// Cria só as entregas que faltam (chamar de novo não duplica). Devolve quantas criou.
export async function generateMonth(clientId:string,month:string,who:Who){
  const db=database();
  const c:any=await db.prepare('SELECT id,name FROM clients WHERE id=?').bind(clientId).first();
  if(!c)throw Error('Cliente não encontrado.');
  const P=await planPreview(c.id,month);
  if(!P.rows.length)return {created:0,noPlan:true};
  const cons:any=await db.prepare("SELECT user_id FROM client_team WHERE client_id=? AND role='consultora' AND COALESCE(user_id,'')<>''").bind(c.id).first();
  const resp=cons?.user_id||who?.id||'',now=Date.now(),mes=MES[+month.slice(5)-1];
  const ops:any[]=[],ids:string[]=[];
  for(const r of P.rows){
    if(!r.create)continue;
    const due=prazos(month,P.weeks,r.qty,r.freq,r.total);
    for(let i=r.existing;i<r.total;i++){
      const id=crypto.randomUUID();ids.push(id);
      ops.push(db.prepare(`INSERT INTO tasks (id,client_id,title,description,strategy,responsible_id,assignee_id,due_date,publish_date,category,format,channels,stage,plan_month,required,created_by,created_at,updated_at)
        VALUES (?,?,?,?,'',?,?,?,?,?,?,'ambos','gestao',?,1,?,?,?)`).bind(id,c.id,`${r.label} ${i+1}/${r.total} · ${mes}`,
        `Entrega do plano de ${mes} (${r.conta}). Defina o tema, o objetivo e o direcionamento no planejamento do ciclo.`,
        resp,resp,due[i],due[i],r.key,FORMAT[r.key]||'feed',month,who?.id||'sistema',now+ops.length,now+ops.length));
    }
  }
  if(!ops.length)return {created:0};
  for(let i=0;i<ops.length;i+=50)await db.batch(ops.slice(i,i+50));
  const hist=ids.map(id=>db.prepare("INSERT INTO task_history (id,task_id,action,from_stage,to_stage,to_user,reason,by_id,by_name,created_at) VALUES (?,?,'criada','','gestao','',?,?,?,?)")
    .bind(crypto.randomUUID(),id,`Gerada pelo plano de ${mes}`,who?.id||'sistema',who?.name||'Sistema',now));
  for(let i=0;i<hist.length;i+=50)await db.batch(hist.slice(i,i+50));
  await logEvent(c.id,'sistema',`Entregas de ${mes} geradas pelo plano`,P.rows.filter((r:any)=>r.create).map((r:any)=>`${r.label}: ${r.create}`).join('\n'),who);
  return {created:ops.length};
}

// Abre o ciclo (se ainda não existe) e gera as entregas do plano. Seguro para chamar várias vezes.
export async function openCycle(clientId:string,month:string,who:Who){
  const db=database(),now=Date.now();
  const r=await db.prepare(`INSERT INTO client_cycles (id,client_id,month,status,opened_at,opened_by) VALUES (?,?,?,'planejamento',?,?)
    ON CONFLICT(client_id,month) DO NOTHING`).bind(crypto.randomUUID(),clientId,month,now,who?.name||'Sistema').run();
  const g=await generateMonth(clientId,month,who);
  if(r.meta.changes)await logEvent(clientId,'sistema',`Ciclo de ${monthLabel(month)} aberto`,`Reuniões de planejamento: ${meetingWindow(month).from.split('-').reverse().join('/')} a ${meetingWindow(month).to.split('-').reverse().join('/')}.`,who);
  return {opened:!!r.meta.changes,...g};
}

// Clientes que entram no ciclo do mês: ativos, em Gestão/onboarding, com plano de entregas e dentro da vigência da operação.
export async function eligibleClients(month:string){
  const first=month+'-01',last=month+'-31';
  return (await database().prepare(`SELECT c.id,c.name FROM clients c
    WHERE c.status='ativo' AND c.phase IN ('gestao','onboarding')
      AND EXISTS (SELECT 1 FROM client_deliverables d WHERE d.client_id=c.id AND d.qty>0)
      AND (c.service_start='' OR c.service_start<=?) AND (c.service_end='' OR c.service_end>=?)`).bind(last,first).all()).results as any[];
}

// Rotina diária (agendador): garante aberto o ciclo do mês seguinte e, a partir do dia 20, o do segundo mês seguinte.
export async function runMonthly(today=new Date()){
  const cur=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');
  const months=[addMonths(cur,1),...(today.getDate()>=20?[addMonths(cur,2)]:[])];
  const out:{month:string;clients:number;opened:number;created:number}[]=[];
  for(const month of months){
    const list=await eligibleClients(month);let opened=0,created=0;
    for(const c of list){const r=await openCycle(c.id,month,null);opened+=r.opened?1:0;created+=r.created||0;}
    out.push({month,clients:list.length,opened,created});
  }
  return out;
}

// Atualiza o status de conclusão dos ciclos (do mês, ou de um cliente/mês).
export async function syncCycles(month?:string,clientId?:string){
  const db=database(),now=Date.now(),w:string[]=[],a:any[]=[];
  if(month){w.push('y.month=?');a.push(month);}
  if(clientId){w.push('y.client_id=?');a.push(clientId);}
  const where=w.length?' AND '+w.join(' AND '):'';
  const req="FROM tasks t WHERE t.client_id=y.client_id AND t.plan_month=y.month AND t.required=1";
  await db.batch([
    db.prepare(`UPDATE client_cycles AS y SET status='concluido',closed_at=? WHERE y.status<>'concluido'${where}
      AND EXISTS (SELECT 1 ${req}) AND NOT EXISTS (SELECT 1 ${req} AND t.stage<>'aprovada')`).bind(now,...a),
    db.prepare(`UPDATE client_cycles AS y SET status=CASE WHEN y.planning_done_at IS NULL THEN 'planejamento' ELSE 'producao' END,closed_at=NULL
      WHERE y.status='concluido'${where} AND EXISTS (SELECT 1 ${req} AND t.stage<>'aprovada')`).bind(...a),
  ]);
}

// Marca a entrega como finalizada e atualiza o ciclo dela.
export async function taskApproved(taskId:string){
  const db=database();
  await db.prepare('UPDATE tasks SET done_at=COALESCE(done_at,?) WHERE id=?').bind(Date.now(),taskId).run();
  const t:any=await db.prepare('SELECT client_id,plan_month FROM tasks WHERE id=?').bind(taskId).first();
  if(t?.plan_month)await syncCycles(t.plan_month,t.client_id);
}
export async function taskReopened(taskId:string){
  const db=database();
  await db.prepare('UPDATE tasks SET done_at=NULL WHERE id=?').bind(taskId).run();
  const t:any=await db.prepare('SELECT client_id,plan_month FROM tasks WHERE id=?').bind(taskId).first();
  if(t?.plan_month)await syncCycles(t.plan_month,t.client_id);
}
