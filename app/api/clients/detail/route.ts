import {database} from '../../../../db/raw';
import {canAccess,currentUser,sameOrigin} from '../../../../lib/auth';
import {TEAM_ROLES,logEvent,onboardingProgress} from '../../../../db/clientes';

// Ficha completa do cliente: cadastro, origem comercial, contratos, equipe, histórico, documentos e onboarding.
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const pode=(req:Request)=>canAccess(req,'clientes')||canAccess(req,'onboarding')||canAccess(req,'gestao');

export async function GET(req:Request){
  if(!pode(req))return json({error:'Você não tem acesso aos clientes.'},403);
  const id=new URL(req.url).searchParams.get('id')||'';
  const db=database();
  const client:any=await db.prepare('SELECT * FROM clients WHERE id=?').bind(id).first();
  if(!client)return json({error:'Cliente não encontrado.'},404);
  const [lead,contracts,team,events,documents,social,ob,people]=await Promise.all([
    client.lead_id?db.prepare('SELECT l.id,l.source,l.interest,l.notes,l.created_at,l.owner_id,u.name AS owner_name FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE l.id=?').bind(client.lead_id).first():null,
    db.prepare(`SELECT id,kind,model,value,term,status,signed_at,sent_at,created_at,data FROM contracts WHERE client_id=? OR (lead_id IS NOT NULL AND lead_id=?) ORDER BY created_at DESC`).bind(id,client.lead_id||'-').all(),
    db.prepare('SELECT t.role,t.user_id,u.name FROM client_team t LEFT JOIN users u ON u.id=t.user_id WHERE t.client_id=?').bind(id).all(),
    db.prepare('SELECT * FROM client_events WHERE client_id=? ORDER BY happened_at DESC,created_at DESC LIMIT 200').bind(id).all(),
    db.prepare('SELECT * FROM client_documents WHERE client_id=? ORDER BY created_at DESC').bind(id).all(),
    db.prepare('SELECT id,network,name,username FROM social_accounts WHERE client_id=?').bind(id).all(),
    db.prepare('SELECT * FROM onboardings WHERE client_id=?').bind(id).first<any>(),
    db.prepare('SELECT id,name FROM users').all(),
  ]);
  const names=Object.fromEntries((people.results as any[]).map(p=>[p.id,p.name]));
  const prog=ob?(await onboardingProgress([ob.id]))[ob.id]:null;
  return json({
    client,lead,social:social.results,
    contracts:contracts.results,
    team:TEAM_ROLES.map(([role,label])=>{const t=(team.results as any[]).find(x=>x.role===role);return {role,label,user_id:t?.user_id||'',name:t?(t.name||names[t.user_id]||(t.user_id==='admin'?'Administrador':'')):''};}),
    events:events.results,documents:documents.results,
    onboarding:ob?{...ob,progress:prog}:null,
    canVault:canAccess(req,'cofre'),
  });
}

// Ações na ficha: team (definir responsável), event (registrar contato/reunião/nota), event_delete, doc, doc_delete
export async function POST(req:Request){
  if(!pode(req)||!sameOrigin(req))return json({error:'Você não tem acesso aos clientes.'},403);
  const u=currentUser(req)!;
  const p:any=await req.json().catch(()=>({}));
  const db=database();
  const client:any=await db.prepare('SELECT id,name FROM clients WHERE id=?').bind(p.client_id).first();
  if(!client)return json({error:'Cliente não encontrado.'},404);
  const s=(v:any,max:number)=>String(v??'').trim().slice(0,max);

  if(p.action==='team'){
    const role=TEAM_ROLES.find(r=>r[0]===p.role);if(!role)return json({error:'Papel inválido.'},400);
    if(!p.user_id){await db.prepare('DELETE FROM client_team WHERE client_id=? AND role=?').bind(client.id,role[0]).run();return json({ok:true});}
    const person:any=p.user_id==='admin'?{name:'Administrador'}:await db.prepare('SELECT name FROM users WHERE id=? AND active=1').bind(p.user_id).first();
    if(!person)return json({error:'Pessoa não encontrada.'},400);
    await db.prepare('INSERT INTO client_team (client_id,role,user_id) VALUES (?,?,?) ON CONFLICT(client_id,role) DO UPDATE SET user_id=excluded.user_id').bind(client.id,role[0],p.user_id).run();
    await logEvent(client.id,'sistema',`${role[1]} responsável: ${person.name}`,'',u);
    return json({ok:true});
  }
  if(p.action==='event'){
    const kind=['contato','reuniao','nota'].includes(p.kind)?p.kind:'nota';
    const title=s(p.title,200);if(title.length<2)return json({error:'Escreva um título.'},400);
    const at=/^\d{4}-\d{2}-\d{2}/.test(String(p.happened_at||''))?String(p.happened_at):new Date().toISOString();
    await logEvent(client.id,kind,title,s(p.body,4000),u,at);
    return json({ok:true});
  }
  if(p.action==='event_delete'){
    const r=await db.prepare("DELETE FROM client_events WHERE id=? AND client_id=? AND kind<>'sistema' AND (author_id=? OR ?)").bind(p.id,client.id,u.id,u.admin?1:0).run();
    return r.meta.changes?json({ok:true}):json({error:'Só quem registrou (ou um administrador) pode apagar.'},403);
  }
  if(p.action==='doc'){
    const name=s(p.name,120),url=s(p.url,1000);
    if(name.length<2)return json({error:'Dê um nome ao documento.'},400);
    if(!/^https:\/\//.test(url))return json({error:'Use um link https:// (Drive, Dropbox, etc.).'},400);
    await db.prepare('INSERT INTO client_documents (id,client_id,name,url,created_by,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),client.id,name,url,u.name,Date.now()).run();
    await logEvent(client.id,'sistema',`Documento adicionado: ${name}`,'',u);
    return json({ok:true});
  }
  if(p.action==='doc_delete'){
    await db.prepare('DELETE FROM client_documents WHERE id=? AND client_id=?').bind(p.id,client.id).run();
    return json({ok:true});
  }
  return json({error:'Ação inválida.'},400);
}
