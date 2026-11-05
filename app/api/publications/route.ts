import {database} from '../../../db/raw';
import {canAccess,currentUser,sameOrigin} from '../../../lib/auth';
import {FORMATS,processPublication,processTarget,publicMediaUrl,validateMedia,type Format,type MediaItem} from '../../../db/publish';
import {NETWORKS} from '../../../db/social';

export const maxDuration=60;
const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

// Lista publicações (com o status de cada rede). Filtros opcionais: ?client=ID&from=ms&to=ms
export async function GET(req:Request){
  if(!canAccess(req,'publicacoes'))return json({error:'Você não tem acesso às Publicações.'},403);
  const q=new URL(req.url).searchParams;
  const where:string[]=[],args:any[]=[];
  if(q.get('client')){where.push('p.client_id=?');args.push(q.get('client'));}
  if(q.get('from')){where.push('p.due_at>=?');args.push(Number(q.get('from')));}
  if(q.get('to')){where.push('p.due_at<?');args.push(Number(q.get('to')));}
  const db=database();
  const pubs=(await db.prepare(`SELECT p.*,c.name AS client_name FROM publications p JOIN clients c ON c.id=p.client_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY p.due_at DESC LIMIT 300`).bind(...args).all()).results as any[];
  const ids=pubs.map(p=>p.id);
  const targets=ids.length?(await db.prepare(`SELECT id,publication_id,account_id,network,status,permalink,error,updated_at FROM publication_targets WHERE publication_id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all()).results as any[]:[];
  const scheduler=!!await db.prepare("SELECT id FROM app_state WHERE id='publication-scheduler'").first();
  return json({schedulerReady:scheduler,publications:pubs.map(p=>({...p,media:JSON.parse(p.media),targets:targets.filter(t=>t.publication_id===p.id)}))});
}

// Cria uma publicação: mode=now publica na hora; mode=schedule entra na fila para o horário escolhido.
export async function POST(req:Request){
  const user=currentUser(req);
  if(!user||!canAccess(req,'publicacoes')||!sameOrigin(req))return json({error:'Acesso restrito.'},403);
  try{
    const p:any=await req.json();
    const db=database();
    const format=p.format as Format;
    if(!FORMATS.includes(format))throw Error('Formato inválido.');
    const networks=[...new Set((Array.isArray(p.networks)?p.networks:[]).filter((n:string)=>(NETWORKS as readonly string[]).includes(n)))] as string[];
    if(!networks.length)throw Error('Escolha pelo menos uma rede.');
    const client:any=await db.prepare('SELECT id FROM clients WHERE id=?').bind(p.clientId).first();
    if(!client)throw Error('Escolha o cliente.');
    const host=new URL(req.url).hostname;
    const media:MediaItem[]=(Array.isArray(p.media)?p.media:[]).slice(0,10).map((m:any)=>({
      url:publicMediaUrl(String(m.url||''),host),kind:m.kind==='video'?'video':'image',
      width:Number(m.width)||undefined,height:Number(m.height)||undefined,
    }));
    validateMedia(format,media,networks);
    const caption=format==='stories'?'':String(p.caption||'');
    if(caption.length>2200)throw Error('A legenda deve ter até 2.200 caracteres (limite do Instagram).');
    if((caption.match(/#/g)||[]).length>30)throw Error('O Instagram aceita no máximo 30 hashtags.');
    if(!['now','schedule'].includes(p.mode))throw Error('Ação inválida.');
    let dueAt=Date.now();
    if(p.mode==='schedule'){
      dueAt=Number(p.dueAt);
      if(!Number.isSafeInteger(dueAt)||dueAt<Date.now()+5*60000)throw Error('Escolha uma data e hora pelo menos 5 minutos no futuro.');
      if(dueAt>Date.now()+75*86400000)throw Error('Agende com até 75 dias de antecedência.');
    }
    const accounts=(await db.prepare(`SELECT id,network FROM social_accounts WHERE client_id=? AND network IN (${networks.map(()=>'?').join(',')})`).bind(client.id,...networks).all()).results as any[];
    const missing=networks.filter(n=>!accounts.some(a=>a.network===n));
    if(missing.length)throw Error('Conecte '+missing.map(n=>n==='facebook'?'a Página do Facebook':'o Instagram').join(' e ')+' deste cliente em Configurações → Redes sociais.');
    const id=crypto.randomUUID(),now=Date.now();
    await db.batch([
      db.prepare('INSERT INTO publications (id,client_id,title,caption,format,media,due_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(id,client.id,String(p.title||'').slice(0,140),caption,format,JSON.stringify(media),dueAt,user.name||user.email,now,now),
      ...accounts.map(a=>db.prepare("INSERT INTO publication_targets (id,publication_id,account_id,network,status,updated_at) VALUES (?,?,?,?,'queued',?)").bind(crypto.randomUUID(),id,a.id,a.network,now)),
    ]);
    if(p.mode==='now')await processPublication(id);
    return json({id});
  }catch(e){return json({error:e instanceof Error?e.message:'Falha ao criar a publicação.'},400);}
}

// Ações sobre um destino (uma rede de uma publicação):
//   process  continua o envio (usado pela tela enquanto a Meta processa vídeos)
//   retry    reenvia um destino com falha (ou "não confirmado", depois de conferir no perfil)
//   confirm  marca como publicado um destino "não confirmado" que foi conferido no perfil
export async function PATCH(req:Request){
  if(!canAccess(req,'publicacoes')||!sameOrigin(req))return json({error:'Acesso restrito.'},403);
  const {id,publicationId,action}=await req.json().catch(()=>({})) as {id?:string;publicationId?:string;action?:string};
  const db=database();
  if(action==='process'&&publicationId){await processPublication(publicationId);return json({ok:true});}
  if(!id)return json({error:'Destino inválido.'},400);
  if(action==='retry'){
    const row=await db.prepare("UPDATE publication_targets SET status='queued',step=NULL,container_id=NULL,error=NULL,attempts=0,lease_until=0,updated_at=? WHERE id=? AND status IN ('failed','unconfirmed','cancelled') RETURNING publication_id").bind(Date.now(),id).first<{publication_id:string}>();
    if(!row)return json({error:'Este envio não pode ser repetido agora.'},409);
    await db.prepare('UPDATE publications SET due_at=MIN(due_at,?) WHERE id=?').bind(Date.now(),row.publication_id).run();
    await processTarget(id);return json({ok:true});
  }
  if(action==='confirm'){
    const row=await db.prepare("UPDATE publication_targets SET status='published',error=NULL,updated_at=? WHERE id=? AND status='unconfirmed' RETURNING id").bind(Date.now(),id).first();
    return row?json({ok:true}):json({error:'Só envios não confirmados podem ser marcados.'},409);
  }
  return json({error:'Ação inválida.'},400);
}

// Cancela os envios que ainda não começaram a etapa final.
export async function DELETE(req:Request){
  if(!canAccess(req,'publicacoes')||!sameOrigin(req))return json({error:'Acesso restrito.'},403);
  const {id}=await req.json().catch(()=>({})) as {id?:string};
  if(!id)return json({error:'Publicação inválida.'},400);
  const r=await database().prepare("UPDATE publication_targets SET status='cancelled',updated_at=? WHERE publication_id=? AND status IN ('queued','processing') AND lease_until<?").bind(Date.now(),id,Date.now()).run();
  return r.meta.changes?json({ok:true,cancelled:r.meta.changes}):json({error:'Nada para cancelar: o envio já começou ou terminou.'},409);
}
