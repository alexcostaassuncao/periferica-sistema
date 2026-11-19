import {database} from '../../../../db/raw';
import {canAccess,currentUser,sameOrigin} from '../../../../lib/auth';
import {logEvent} from '../../../../db/clientes';
import {DELIVERABLES,FREQS,deliverablesOf,monthTotals,weeksOf} from '../../../../db/entregas';

// O que o plano inclui (entregas por categoria) e o total previsto no mês.
// GET ?client=ID&month=YYYY-MM · POST {action:'save', client_id, items:[{key,qty,freq}]} · POST {action:'weeks', month, weeks}
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const pode=(req:Request)=>canAccess(req,'clientes')||canAccess(req,'gestao')||canAccess(req,'contratos');

export async function GET(req:Request){
  if(!pode(req))return json({error:'Sem acesso.'},403);
  const q=new URL(req.url).searchParams;
  const month=/^\d{4}-\d{2}$/.test(q.get('month')||'')?q.get('month')!:new Date().toISOString().slice(0,7);
  const client=q.get('client')||'';
  if(!await database().prepare('SELECT id FROM clients WHERE id=?').bind(client).first())return json({error:'Cliente não encontrado.'},404);
  const items=await deliverablesOf(client),w=await weeksOf(month);
  return json({month,weeks:w.weeks,weeksCustom:w.custom,weeksBy:w.updated_by,items,totals:monthTotals(items,w.weeks)});
}

export async function POST(req:Request){
  if(!pode(req)||!sameOrigin(req))return json({error:'Sem acesso.'},403);
  const u=currentUser(req)!;
  const p:any=await req.json().catch(()=>({}));
  const db=database(),now=Date.now();
  if(p.action==='save'){
    const c:any=await db.prepare('SELECT id FROM clients WHERE id=?').bind(p.client_id).first();
    if(!c)return json({error:'Cliente não encontrado.'},404);
    const items=Array.isArray(p.items)?p.items:[];
    const ops=[],resumo:string[]=[];
    for(const d of DELIVERABLES){
      const it=items.find((x:any)=>x.key===d.key);if(!it)continue;
      const qty=Math.floor(Number(it.qty));
      if(!Number.isFinite(qty)||qty<0||qty>999)return json({error:`Quantidade inválida em ${d.label}.`},400);
      const freq=FREQS.includes(it.freq)?it.freq:'mes';
      ops.push(db.prepare('INSERT INTO client_deliverables (client_id,category,qty,freq,updated_by,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(client_id,category) DO UPDATE SET qty=excluded.qty,freq=excluded.freq,updated_by=excluded.updated_by,updated_at=excluded.updated_at')
        .bind(c.id,d.key,qty,freq,u.name,now));
      if(qty)resumo.push(`${d.label}: ${qty} ${d.unit} por ${freq==='semana'?'semana':'mês'}`);
    }
    if(!ops.length)return json({error:'Nada para salvar.'},400);
    await db.batch(ops);
    await logEvent(c.id,'sistema','Entregas do plano atualizadas',resumo.join('\n')||'Sem entregas',u);
    return json({ok:true});
  }
  // Calendário de produção: semanas do mês (vale para todos os clientes)
  if(p.action==='weeks'){
    if(!canAccess(req,'gestao'))return json({error:'Só a Gestão define as semanas de produção.'},403);
    if(!/^\d{4}-\d{2}$/.test(p.month||''))return json({error:'Mês inválido.'},400);
    const weeks=Math.floor(Number(p.weeks));if(!(weeks>=1&&weeks<=6))return json({error:'Use de 1 a 6 semanas.'},400);
    await db.prepare('INSERT INTO production_weeks (month,weeks,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(month) DO UPDATE SET weeks=excluded.weeks,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(p.month,weeks,u.name,now).run();
    return json({ok:true});
  }
  return json({error:'Ação inválida.'},400);
}
