import {database} from '../../../../db/raw';
import {canAccess,currentUser,sameOrigin} from '../../../../lib/auth';
import {decryptToken,encryptToken} from '../../../../db/social';
import {logEvent} from '../../../../db/clientes';

// Cofre de senhas dos clientes. Só quem tem a área "cofre" (liberada pelo administrador) acessa.
// A senha fica criptografada no banco e só é mostrada quando alguém clica em "ver"; cada visualização fica no histórico.
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const denied=()=>json({error:'Você não tem acesso ao cofre de senhas. Peça para a direção liberar em Equipe → Usuários.'},403);

export async function GET(req:Request){
  if(!canAccess(req,'cofre'))return denied();
  const id=new URL(req.url).searchParams.get('client')||'';
  const rows=(await database().prepare('SELECT id,platform,login,access_type,url,notes,status,updated_by,updated_at,secret_cipher<>\'\' AS has_secret FROM client_vault WHERE client_id=? ORDER BY platform').bind(id).all()).results;
  return json({items:rows});
}

// action: save (criar/editar) · reveal (mostrar senha) · delete
export async function POST(req:Request){
  if(!canAccess(req,'cofre')||!sameOrigin(req))return denied();
  const u=currentUser(req)!;
  const p:any=await req.json().catch(()=>({}));
  const db=database();
  const s=(v:any,max:number)=>String(v??'').trim().slice(0,max);
  if(p.action==='save'){
    const client:any=await db.prepare('SELECT id FROM clients WHERE id=?').bind(p.client_id).first();
    if(!client)return json({error:'Cliente não encontrado.'},404);
    const platform=s(p.platform,80);if(platform.length<2)return json({error:'Informe a plataforma (ex.: Instagram, Meta Business).'},400);
    const fields={platform,login:s(p.login,200),access_type:s(p.access_type,80),url:s(p.url,500),notes:s(p.notes,1000),status:['liberado','pendente','revogado'].includes(p.status)?p.status:'liberado'};
    let cipher:string|null=null;
    if(typeof p.secret==='string'&&p.secret){
      try{cipher=await encryptToken(p.secret.slice(0,500));}catch{return json({error:'A chave de criptografia (SOCIAL_TOKEN_KEY) não está configurada.'},503);}
    }
    if(p.id){
      const r=await db.prepare(`UPDATE client_vault SET platform=?,login=?,access_type=?,url=?,notes=?,status=?${cipher?',secret_cipher=?':''},updated_by=?,updated_at=? WHERE id=? AND client_id=?`)
        .bind(...Object.values(fields),...(cipher?[cipher]:[]),u.name,Date.now(),p.id,client.id).run();
      if(!r.meta.changes)return json({error:'Acesso não encontrado.'},404);
    }else{
      await db.prepare('INSERT INTO client_vault (id,client_id,platform,login,access_type,url,notes,status,secret_cipher,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(crypto.randomUUID(),client.id,...Object.values(fields),cipher||'',u.name,Date.now()).run();
    }
    await logEvent(client.id,'sistema',`Cofre: acesso ${p.id?'atualizado':'cadastrado'} (${platform})`,'',u);
    return json({ok:true});
  }
  const item:any=await db.prepare('SELECT * FROM client_vault WHERE id=?').bind(p.id).first();
  if(!item)return json({error:'Acesso não encontrado.'},404);
  if(p.action==='reveal'){
    if(!item.secret_cipher)return json({secret:''});
    let secret='';try{secret=await decryptToken(item.secret_cipher);}catch{return json({error:'Não foi possível abrir a senha (a chave de criptografia mudou).'},500);}
    await logEvent(item.client_id,'sistema',`Cofre: senha de ${item.platform} visualizada`,'',u);
    return json({secret});
  }
  if(p.action==='delete'){
    await db.prepare('DELETE FROM client_vault WHERE id=?').bind(item.id).run();
    await logEvent(item.client_id,'sistema',`Cofre: acesso removido (${item.platform})`,'',u);
    return json({ok:true});
  }
  return json({error:'Ação inválida.'},400);
}
