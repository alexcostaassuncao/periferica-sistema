import {database} from '../../../db/raw';
import {canAccess,currentUser,sameOrigin} from '../../../lib/auth';
import {logEvent} from '../../../db/clientes';
import {cleanUrl,type U} from '../../../db/tarefas';
import {mailReady,sendMail} from '../../../lib/mail';

// Reuniões: o mesmo registro aparece na Agenda, na Gestão do cliente e no histórico do cliente.
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const pode=(req:Request)=>canAccess(req,'agenda')||canAccess(req,'gestao');
const denied=()=>json({error:'Você não tem acesso às reuniões.'},403);
const s=(v:any,max:number)=>String(v??'').trim().slice(0,max);
const PLACES=['sala','estudio','cliente','mesa','online'];
const ROOMS:Record<string,string>={sala:'Sala de Reunião',estudio:'Estúdio'};
const hhmm=/^([01]\d|2[0-3]):[0-5]\d$/;

// Regra de carteira: reuniões de clientes fora da carteira do usuário não aparecem (internas aparecem).
function vis(u:U){
  if(u.admin||!u.squads.length)return {sql:'1=1',args:[] as any[]};
  return {sql:`(m.client_id IS NULL OR c.squad IN (${u.squads.map(()=>'?').join(',')}) OR EXISTS (SELECT 1 FROM client_team ct WHERE ct.client_id=m.client_id AND ct.user_id=?) OR m.participants LIKE ?)`,
    args:[...u.squads,u.id,`%"${u.id}"%`]};
}
async function conflict(place:string,date:string,start:string,end:string,ignore:string){
  if(!ROOMS[place])return null;
  return database().prepare('SELECT title,start_time,end_time FROM meetings WHERE place=? AND date=? AND start_time<? AND end_time>? AND id<>? LIMIT 1').bind(place,date,end,start,ignore||'-').first<any>();
}

export async function GET(req:Request){
  const u=currentUser(req) as U|null;
  if(!u||!pode(req))return denied();
  const q=new URL(req.url).searchParams,db=database();
  // Salas livres num horário
  if(q.get('rooms')){
    const date=q.get('date')||'',start=q.get('start')||'',end=q.get('end')||'';
    const out=await Promise.all(Object.entries(ROOMS).map(async([k,label])=>{const c=await conflict(k,date,start,end,q.get('ignore')||'');return {place:k,label,free:!c,busy:c?`${c.title} (${c.start_time}–${c.end_time})`:''};}));
    return json({rooms:out});
  }
  const v=vis(u);
  const id=q.get('id');
  if(id){
    const m:any=await db.prepare(`SELECT m.*,c.name AS client_name,c.email AS client_email,c.phone AS client_phone,c.contact_name AS client_contact FROM meetings m LEFT JOIN clients c ON c.id=m.client_id WHERE m.id=? AND ${v.sql}`).bind(id,...v.args).first();
    if(!m)return json({error:'Reunião não encontrada.'},404);
    const files=(await db.prepare('SELECT * FROM meeting_files WHERE meeting_id=? ORDER BY created_at').bind(id).all()).results;
    const tasks=(await db.prepare('SELECT id,title,stage FROM tasks WHERE meeting_id=?').bind(id).all()).results;
    return json({meeting:{...m,participants:JSON.parse(m.participants||'[]')},files,tasks});
  }
  const where=[v.sql],args=[...v.args];
  if(q.get('from')){where.push('m.date>=?');args.push(q.get('from')!);}
  if(q.get('to')){where.push('m.date<=?');args.push(q.get('to')!);}
  if(q.get('client')){where.push('m.client_id=?');args.push(q.get('client')!);}
  if(q.get('person')){where.push('m.participants LIKE ?');args.push(`%"${q.get('person')}"%`);}
  if(q.get('place')){where.push('m.place=?');args.push(q.get('place')!);}
  const rows=(await db.prepare(`SELECT m.id,m.client_id,m.title,m.date,m.start_time,m.end_time,m.place,m.meet_url,m.participants,m.minutes_summary<>'' OR m.minutes_text<>'' AS has_minutes,
      (SELECT COUNT(*) FROM meeting_files f WHERE f.meeting_id=m.id) AS files,c.name AS client_name
    FROM meetings m LEFT JOIN clients c ON c.id=m.client_id WHERE ${where.join(' AND ')} ORDER BY m.date,m.start_time LIMIT 600`).bind(...args).all()).results as any[];
  return json({meetings:rows.map(r=>({...r,participants:JSON.parse(r.participants||'[]'),has_minutes:!!r.has_minutes}))});
}

// Criar ou editar (mesmo registro pela Agenda ou pela Gestão)
export async function POST(req:Request){
  const u=currentUser(req) as U|null;
  if(!u||!pode(req)||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  const db=database(),now=Date.now();
  const title=s(p.title,160);if(title.length<3)return json({error:'Dê um título à reunião.'},400);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date||''))return json({error:'Escolha a data.'},400);
  if(!hhmm.test(p.start_time||'')||!hhmm.test(p.end_time||''))return json({error:'Informe o horário de início e de fim.'},400);
  if(p.end_time<=p.start_time)return json({error:'O fim precisa ser depois do início.'},400);
  const place=PLACES.includes(p.place)?p.place:'online';
  const meet=s(p.meet_url,500);
  if(meet&&!/^https:\/\/(meet\.google\.com|[\w.-]+\.(zoom\.us|teams\.microsoft\.com))\//.test(meet))return json({error:'O link precisa ser do Google Meet (https://meet.google.com/...).'},400);
  const client=p.client_id?await db.prepare('SELECT id,name FROM clients WHERE id=?').bind(p.client_id).first<any>():null;
  if(p.client_id&&!client)return json({error:'Cliente inválido.'},400);
  const ids=[...new Set((Array.isArray(p.participants)?p.participants:[]).map(String))].slice(0,30);
  if(ids.length){const ok=(await db.prepare(`SELECT id FROM users WHERE active=1 AND id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all()).results.map((r:any)=>r.id);
    const invalid=ids.filter(i=>i!=='admin'&&!ok.includes(i));if(invalid.length)return json({error:'Há participantes que não existem mais na equipe.'},400);}
  const c=await conflict(place,p.date,p.start_time,p.end_time,p.id||'');
  if(c)return json({error:`${ROOMS[place]} ocupada nesse horário: ${c.title} (${c.start_time}–${c.end_time}). Escolha outro horário ou local.`},409);
  const vals=[client?.id||null,title,p.date,p.start_time,p.end_time,place,meet,s(p.description,4000),JSON.stringify(ids)];
  if(p.id){
    const old:any=await db.prepare('SELECT id,client_id FROM meetings WHERE id=?').bind(p.id).first();
    if(!old)return json({error:'Reunião não encontrada.'},404);
    await db.prepare('UPDATE meetings SET client_id=?,title=?,date=?,start_time=?,end_time=?,place=?,meet_url=?,description=?,participants=?,updated_at=? WHERE id=?').bind(...vals,now,p.id).run();
    if(client)await logEvent(client.id,'reuniao',`Reunião atualizada: ${title}`,`${p.date.split('-').reverse().join('/')} às ${p.start_time}`,u);
    return json({id:p.id});
  }
  const id=crypto.randomUUID();
  await db.prepare('INSERT INTO meetings (id,client_id,title,date,start_time,end_time,place,meet_url,description,participants,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,...vals,u.name,now,now).run();
  if(client)await logEvent(client.id,'reuniao',`Reunião agendada: ${title}`,`${p.date.split('-').reverse().join('/')} das ${p.start_time} às ${p.end_time}${meet?'\nMeet: '+meet:''}`,u,`${p.date}T${p.start_time}:00`);
  return json({id});
}

// Ata (texto colado + resumo), anexos e compartilhamento com o cliente
export async function PATCH(req:Request){
  const u=currentUser(req) as U|null;
  if(!u||!pode(req)||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  const db=database(),now=Date.now();
  const v=vis(u);
  const m:any=await db.prepare(`SELECT m.*,c.name AS client_name,c.email AS client_email,c.phone AS client_phone FROM meetings m LEFT JOIN clients c ON c.id=m.client_id WHERE m.id=? AND ${v.sql}`).bind(p.id,...v.args).first();
  if(!m)return json({error:'Reunião não encontrada.'},404);
  if(p.action==='minutes'){
    await db.prepare('UPDATE meetings SET minutes_text=?,minutes_summary=?,minutes_updated_by=?,minutes_updated_at=?,updated_at=? WHERE id=?')
      .bind(s(p.minutes_text,40000),s(p.minutes_summary,6000),u.name,now,now,m.id).run();
    if(m.client_id)await logEvent(m.client_id,'reuniao',`Ata ${m.minutes_updated_at?'editada':'adicionada'}: ${m.title}`,s(p.minutes_summary,600),u);
    return json({ok:true});
  }
  if(p.action==='file_add'){
    const url=cleanUrl(p.url);if(!url)return json({error:'Envie o arquivo ou use um link https://.'},400);
    const name=s(p.name,160)||'Anexo';
    await db.prepare('INSERT INTO meeting_files (id,meeting_id,name,url,kind,created_by,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),m.id,name,url,s(p.kind,20)||'arquivo',u.name,now).run();
    return json({ok:true});
  }
  if(p.action==='file_del'){
    await db.prepare('DELETE FROM meeting_files WHERE id=? AND meeting_id=?').bind(p.file_id,m.id).run();
    return json({ok:true});
  }
  // Compartilhar com o cliente: monta o texto (o mesmo que aparece na prévia) e envia por email, se pedido.
  if(p.action==='share'){
    if(!m.client_id)return json({error:'Reunião interna: não há cliente para compartilhar.'},400);
    if(!m.minutes_summary)return json({error:'Escreva o resumo da ata antes de compartilhar.'},400);
    const files=(await db.prepare('SELECT name,url FROM meeting_files WHERE meeting_id=?').bind(m.id).all()).results as any[];
    const publicFiles=files.filter(f=>f.url.startsWith('https://'));
    const text=`Olá! Segue o resumo da nossa reunião "${m.title}" (${m.date.split('-').reverse().join('/')}):\n\n${m.minutes_summary}${publicFiles.length?'\n\nAnexos:\n'+publicFiles.map(f=>`• ${f.name}: ${f.url}`).join('\n'):''}\n\nQualquer dúvida estamos à disposição.\nPeriférica`;
    if(p.preview)return json({text,to:m.client_email||'',phone:m.client_phone||''});
    if(p.via==='email'){
      const to=s(p.to,200).toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))return json({error:'Informe o email do cliente.'},400);
      if(!mailReady())return json({error:'O envio de emails ainda não está configurado na Vercel.'},503);
      if(!await sendMail({to,subject:`Ata da reunião: ${m.title} | Periférica`,text}))return json({error:'O email não saiu.'},502);
    }
    await logEvent(m.client_id,'reuniao',`Ata compartilhada com o cliente (${p.via==='email'?'email':'WhatsApp'}): ${m.title}`,'',u);
    return json({ok:true,text,phone:m.client_phone||''});
  }
  return json({error:'Ação inválida.'},400);
}

export async function DELETE(req:Request){
  const u=currentUser(req) as U|null;
  if(!u||!pode(req)||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  const m:any=await database().prepare('SELECT id,client_id,title FROM meetings WHERE id=?').bind(p.id).first();
  if(!m)return json({error:'Reunião não encontrada.'},404);
  await database().prepare('DELETE FROM meetings WHERE id=?').bind(m.id).run();
  if(m.client_id)await logEvent(m.client_id,'reuniao',`Reunião cancelada: ${m.title}`,'',u);
  return json({ok:true});
}
