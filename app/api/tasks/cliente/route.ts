import {database} from '../../../../db/raw';
import {sha256} from '../../../../lib/session';
import {logTask} from '../../../../db/tarefas';

// Página de aprovação do cliente (sem login). Mostra SÓ a entrega atual, a legenda e a mensagem da equipe.
// Briefing, histórico, comentários internos e versões antigas nunca saem daqui.
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
async function byToken(t:string){
  if(!/^[0-9a-f]{48}$/.test(t))return null;
  return database().prepare("SELECT t.*,c.name AS client_name FROM tasks t JOIN clients c ON c.id=t.client_id WHERE t.share_hash=? AND t.share_expires>?").bind(await sha256(t),Date.now()).first<any>();
}

export async function GET(req:Request){
  const t=await byToken(new URL(req.url).searchParams.get('t')||'');
  if(!t)return json({error:'Este link expirou ou não é válido. Peça um novo link para a equipe da Periférica.'},404);
  const v:any=await database().prepare('SELECT url,kind FROM task_versions WHERE task_id=? ORDER BY version DESC LIMIT 1').bind(t.id).first();
  return json({client:t.client_name,title:t.title,format:t.format,channels:t.channels,caption:t.caption,message:t.client_message,
    media:v?{url:v.url,kind:v.kind}:null,status:t.client_status});
}

export async function POST(req:Request){
  const p:any=await req.json().catch(()=>({}));
  const t=await byToken(String(p.t||''));
  if(!t)return json({error:'Este link expirou ou não é válido.'},404);
  if(t.stage!=='cliente'||t.client_status!=='aguardando')return json({error:'Este material já foi respondido. Obrigado!'},409);
  const now=Date.now(),comment=String(p.comment||'').trim().slice(0,2000);
  const db=database();
  if(p.decision==='aprovar'){
    await db.prepare("UPDATE tasks SET stage='aprovada',client_status='aprovada',client_feedback=?,updated_at=? WHERE id=? AND stage='cliente'").bind(comment,now,t.id).run();
    await logTask(t.id,null,'aprovada',{from:'cliente',to:'aprovada',reason:comment||'Aprovado pelo cliente no link.'});
    return json({ok:true});
  }
  if(p.decision==='ajustes'){
    if(comment.length<3)return json({error:'Conte o que você gostaria de ajustar.'},400);
    await db.prepare("UPDATE tasks SET stage='revisao',client_status='ajustes',client_feedback=?,updated_at=? WHERE id=? AND stage='cliente'").bind(comment,now,t.id).run();
    await logTask(t.id,null,'cliente_ajustes',{from:'cliente',to:'revisao',reason:comment});
    return json({ok:true});
  }
  return json({error:'Escolha aprovar ou pedir ajustes.'},400);
}
