import {database} from '../../../../db/raw';
import {currentUser,sameOrigin} from '../../../../lib/auth';
import {logEvent} from '../../../../db/clientes';
import {type U} from '../../../../db/tarefas';
import {deliverablesOf,monthTotals,weeksOf} from '../../../../db/entregas';

/* Gerar as tarefas do mês a partir do "O que o plano inclui".
   GET ?client=ID&month=YYYY-MM  → prévia (quantas o plano pede, quantas já existem, quantas serão criadas)
   POST {client_id, month}       → cria só as que faltam (clicar de novo não duplica). */
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const MES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const FORMAT:Record<string,string>={social:'feed',campanha:'feed',video_organico:'reels',video_campanha:'reels'};
const iso=(d:Date)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');

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

async function plano(clientId:string,month:string){
  const db=database();
  const items=await deliverablesOf(clientId),w=await weeksOf(month);
  const totals=monthTotals(items,w.weeks);
  const ex=((await db.prepare('SELECT category,COUNT(*) n FROM tasks WHERE client_id=? AND plan_month=? GROUP BY category').bind(clientId,month).all()).results as any[]);
  const has=Object.fromEntries(ex.map(r=>[r.category,Number(r.n)]));
  return {weeks:w.weeks,rows:totals.map((t:any)=>({...t,existing:has[t.key]||0,create:Math.max(0,t.total-(has[t.key]||0))}))};
}
const gestor=(u:U|null)=>!!u&&(u.admin||u.areas.includes('gestao'));

export async function GET(req:Request){
  const u=currentUser(req) as U|null;if(!gestor(u))return json({error:'Sem acesso.'},403);
  const q=new URL(req.url).searchParams,month=q.get('month')||'';
  if(!/^\d{4}-\d{2}$/.test(month))return json({error:'Mês inválido.'},400);
  if(!await database().prepare('SELECT id FROM clients WHERE id=?').bind(q.get('client')||'').first())return json({error:'Cliente não encontrado.'},404);
  return json({month,...await plano(q.get('client')!,month)});
}

export async function POST(req:Request){
  const u=currentUser(req) as U|null;if(!gestor(u)||!sameOrigin(req))return json({error:'Só a Gestão gera as tarefas do mês.'},403);
  const p:any=await req.json().catch(()=>({}));
  if(!/^\d{4}-\d{2}$/.test(p.month||''))return json({error:'Mês inválido.'},400);
  const db=database();
  const c:any=await db.prepare('SELECT id,name FROM clients WHERE id=?').bind(p.client_id).first();
  if(!c)return json({error:'Cliente não encontrado.'},404);
  const P=await plano(c.id,p.month);
  if(!P.rows.length)return json({error:'Defina primeiro o que o plano inclui (ficha do cliente → Serviços e contratos).'},400);
  const cons:any=await db.prepare("SELECT user_id FROM client_team WHERE client_id=? AND role='consultora' AND COALESCE(user_id,'')<>''").bind(c.id).first();
  const resp=cons?.user_id||u!.id,now=Date.now(),mes=MES[+p.month.slice(5)-1];
  const ops:any[]=[],ids:string[]=[];
  for(const r of P.rows){
    if(!r.create)continue;
    const due=prazos(p.month,P.weeks,r.qty,r.freq,r.total);
    for(let i=r.existing;i<r.total;i++){
      const id=crypto.randomUUID();ids.push(id);
      ops.push(db.prepare(`INSERT INTO tasks (id,client_id,title,description,strategy,responsible_id,assignee_id,due_date,category,format,channels,stage,plan_month,created_by,created_at,updated_at)
        VALUES (?,?,?,?,'',?,?,?,?,?,'ambos','gestao',?,?,?,?)`).bind(id,c.id,`${r.label} ${i+1}/${r.total} · ${mes}`,
        `Tarefa gerada pelo plano de ${mes} (${r.conta}). Edite o tema, a descrição e o direcionamento antes de enviar para a Copy.`,
        resp,resp,due[i],r.key,FORMAT[r.key]||'feed',p.month,u!.id,now+ops.length,now+ops.length));
    }
  }
  if(!ops.length)return json({created:0,message:'As tarefas deste mês já foram geradas.'});
  for(let i=0;i<ops.length;i+=50)await db.batch(ops.slice(i,i+50));
  await db.batch(ids.map(id=>db.prepare("INSERT INTO task_history (id,task_id,action,from_stage,to_stage,to_user,reason,by_id,by_name,created_at) VALUES (?,?,'criada','','gestao','','Gerada pelo plano do mês',?,?,?)").bind(crypto.randomUUID(),id,u!.id,u!.name,now)));
  await logEvent(c.id,'sistema',`Tarefas de ${mes} geradas pelo plano`,P.rows.filter((r:any)=>r.create).map((r:any)=>`${r.label}: ${r.create}`).join('\n'),u);
  return json({created:ops.length});
}
