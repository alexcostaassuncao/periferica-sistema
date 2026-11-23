import {database} from '../../../../db/raw';
import {sha256} from '../../../../lib/session';
import {logTask} from '../../../../db/tarefas';
import {monthLabel,taskApproved} from '../../../../db/ciclos';

/* Portal do cliente — grade do mês (sem login, pelo link gerado na Gestão).
   Mostra só o que já passou pela revisão interna (etapa "Com o cliente") e o que já foi aprovado.
   O cliente aprova ou pede alteração em CADA conteúdo, independente dos demais.
   Briefing, histórico, comentários internos e versões antigas nunca saem daqui. */
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
async function byToken(t:string){
  if(!/^[0-9a-f]{48}$/.test(t))return null;
  return database().prepare('SELECT y.*,c.name AS client_name FROM client_cycles y JOIN clients c ON c.id=y.client_id WHERE y.grade_hash=? AND y.grade_expires>?')
    .bind(await sha256(t),Date.now()).first<any>();
}

export async function GET(req:Request){
  const y=await byToken(new URL(req.url).searchParams.get('t')||'');
  if(!y)return json({error:'Este link expirou ou não é válido. Peça um novo link para a equipe da Periférica.'},404);
  const rows=(await database().prepare(`SELECT t.id,t.title,t.category,t.format,t.channels,t.publish_date,t.art_text,t.caption,t.script,t.stage,t.client_status,t.client_feedback,
      (SELECT url FROM task_versions v WHERE v.task_id=t.id ORDER BY version DESC LIMIT 1) AS url,
      (SELECT kind FROM task_versions v WHERE v.task_id=t.id ORDER BY version DESC LIMIT 1) AS kind
    FROM tasks t WHERE t.client_id=? AND t.plan_month=? ORDER BY CASE WHEN t.publish_date='' THEN 1 ELSE 0 END,t.publish_date,t.created_at`).bind(y.client_id,y.month).all()).results as any[];
  const visible=rows.filter(t=>t.stage==='cliente'||t.stage==='aprovada');
  return json({client:y.client_name,month:y.month,label:monthLabel(y.month),
    items:visible.map(t=>({id:t.id,title:t.title,category:t.category,format:t.format,channels:t.channels,publish_date:t.publish_date,
      art_text:t.art_text,caption:t.caption,script:t.category.startsWith('video')?t.script:'',media:t.url?{url:t.url,kind:t.kind}:null,
      status:t.stage==='aprovada'?'aprovada':t.client_status==='ajustes'?'ajustes':'aguardando'})),
    summary:{total:rows.length,aguardando:visible.filter(t=>t.stage==='cliente').length,aprovadas:visible.filter(t=>t.stage==='aprovada').length,
      ajustes:rows.filter(t=>t.client_status==='ajustes'&&t.stage!=='aprovada').length,producao:rows.length-visible.length}});
}

export async function POST(req:Request){
  const p:any=await req.json().catch(()=>({}));
  const y=await byToken(String(p.t||''));
  if(!y)return json({error:'Este link expirou ou não é válido.'},404);
  const db=database();
  const t:any=await db.prepare('SELECT id,stage,client_status FROM tasks WHERE id=? AND client_id=? AND plan_month=?').bind(String(p.task_id||''),y.client_id,y.month).first();
  if(!t)return json({error:'Conteúdo não encontrado nesta grade.'},404);
  if(t.stage!=='cliente')return json({error:'Este conteúdo já foi respondido. Obrigado!'},409);
  const now=Date.now(),comment=String(p.comment||'').trim().slice(0,2000);
  if(p.decision==='aprovar'){
    const r=await db.prepare("UPDATE tasks SET stage='aprovada',client_status='aprovada',client_feedback=?,updated_at=? WHERE id=? AND stage='cliente'").bind(comment,now,t.id).run();
    if(!r.meta.changes)return json({error:'Este conteúdo já foi respondido.'},409);
    await logTask(t.id,null,'aprovada',{from:'cliente',to:'aprovada',reason:comment||'Aprovado pelo cliente na grade do mês.'});
    await taskApproved(t.id);
    return json({ok:true});
  }
  if(p.decision==='ajustes'){
    if(comment.length<3)return json({error:'Conte o que você gostaria de alterar.'},400);
    // Volta para a Revisão da consultora com o pedido do cliente; ela encaminha para quem faz o ajuste (Copy, Videomaker ou Design).
    const r=await db.prepare("UPDATE tasks SET stage='revisao',client_status='ajustes',client_feedback=?,updated_at=? WHERE id=? AND stage='cliente'").bind(comment,now,t.id).run();
    if(!r.meta.changes)return json({error:'Este conteúdo já foi respondido.'},409);
    await logTask(t.id,null,'cliente_ajustes',{from:'cliente',to:'revisao',reason:comment});
    return json({ok:true});
  }
  return json({error:'Escolha aprovar ou pedir alteração.'},400);
}
