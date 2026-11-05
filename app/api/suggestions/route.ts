import {database} from '../../../db/raw';
import {currentUser,isDev,sameOrigin} from '../../../lib/auth';

// Modo desenvolvedor: sugestões de melhoria feitas na própria tela.
// Só Administrador e Desenvolvedor enviam, veem e mudam o status.
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const denied=()=>json({error:'O modo desenvolvedor é só para administradores e desenvolvedores.'},403);
const KINDS=['bug','melhoria','visual','texto','ideia'],PRIORITIES=['baixa','media','alta'];
const STATUSES=['nova','analise','andamento','feita','descartada'];
const MAX_IMAGES=6,MAX_INLINE=900_000; // imagem embutida (sem Cloudinary) até ~900 KB

// Aceita links do Cloudinary ou imagens embutidas (data:image/...) quando o Cloudinary não estiver configurado.
function cleanImages(v:unknown){
  const list=Array.isArray(v)?v:[];
  return list.slice(0,MAX_IMAGES).map(String).filter(u=>
    /^https:\/\/res\.cloudinary\.com\//.test(u)||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u)&&u.length<=MAX_INLINE);
}

export async function GET(req:Request){
  if(!isDev(req))return denied();
  const q=new URL(req.url).searchParams,db=database();
  const where:string[]=[],args:any[]=[];
  if(q.get('page')){where.push('page=?');args.push(q.get('page'));}
  if(q.get('status')&&STATUSES.includes(q.get('status')!)){where.push('status=?');args.push(q.get('status'));}
  const rows=(await db.prepare(`SELECT * FROM suggestions ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY CASE status WHEN 'nova' THEN 0 WHEN 'analise' THEN 1 WHEN 'andamento' THEN 2 ELSE 3 END, created_at DESC LIMIT 300`).bind(...args).all()).results as any[];
  const ids=rows.map(r=>r.id);
  const comments=ids.length?(await db.prepare(`SELECT * FROM suggestion_comments WHERE suggestion_id IN (${ids.map(()=>'?').join(',')}) ORDER BY created_at`).bind(...ids).all()).results as any[]:[];
  const counts=(await db.prepare("SELECT page,COUNT(*) AS n FROM suggestions WHERE status IN ('nova','analise','andamento') GROUP BY page").all()).results;
  return json({suggestions:rows.map(r=>({...r,images:JSON.parse(r.images||'[]'),comments:comments.filter(c=>c.suggestion_id===r.id)})),openByPage:counts});
}

export async function POST(req:Request){
  if(!isDev(req)||!sameOrigin(req))return denied();
  const u=currentUser(req)!;
  const p:any=await req.json().catch(()=>({}));
  const body=String(p.body||'').trim().slice(0,4000);
  const images=cleanImages(p.images);
  if(body.length<3&&!images.length)return json({error:'Escreva a sugestão ou anexe um print.'},400);
  const page=String(p.page||'').slice(0,200);
  if(!page.startsWith('/'))return json({error:'Página inválida.'},400);
  const id=crypto.randomUUID(),now=Date.now();
  await database().prepare(`INSERT INTO suggestions (id,page,page_title,selector,element_text,viewport,kind,priority,body,images,status,author_id,author_name,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,'nova',?,?,?,?)`).bind(id,page,String(p.page_title||'').slice(0,120),String(p.selector||'').slice(0,500),String(p.element_text||'').slice(0,200),
    String(p.viewport||'').slice(0,40),KINDS.includes(p.kind)?p.kind:'melhoria',PRIORITIES.includes(p.priority)?p.priority:'media',body,JSON.stringify(images),u.id,u.name,now,now).run();
  return json({id});
}

// status: muda a situação · comment: adiciona comentário
export async function PATCH(req:Request){
  if(!isDev(req)||!sameOrigin(req))return denied();
  const u=currentUser(req)!;
  const p:any=await req.json().catch(()=>({}));
  const db=database(),now=Date.now();
  if(!await db.prepare('SELECT id FROM suggestions WHERE id=?').bind(p.id).first())return json({error:'Sugestão não encontrada.'},404);
  if(p.status!==undefined){
    if(!STATUSES.includes(p.status))return json({error:'Status inválido.'},400);
    await db.prepare('UPDATE suggestions SET status=?,updated_at=? WHERE id=?').bind(p.status,now,p.id).run();
  }
  if(typeof p.comment==='string'&&p.comment.trim()){
    await db.batch([
      db.prepare('INSERT INTO suggestion_comments (id,suggestion_id,author_id,author_name,body,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),p.id,u.id,u.name,p.comment.trim().slice(0,2000),now),
      db.prepare('UPDATE suggestions SET updated_at=? WHERE id=?').bind(now,p.id),
    ]);
  }
  return json({ok:true});
}

// Apaga: quem criou ou o administrador.
export async function DELETE(req:Request){
  if(!isDev(req)||!sameOrigin(req))return denied();
  const u=currentUser(req)!;
  const p:any=await req.json().catch(()=>({}));
  const r=await database().prepare('DELETE FROM suggestions WHERE id=? AND (author_id=? OR ?)').bind(p.id,u.id,u.admin?1:0).run();
  return r.meta.changes?json({ok:true}):json({error:'Só quem criou (ou um administrador) pode apagar.'},403);
}
