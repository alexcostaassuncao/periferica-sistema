import {database} from '../../../db/raw';
import {isAdmin,sameOrigin} from '../../../lib/auth';
import {linkPageToClient,metaReady,metaRedirectUri} from '../../../db/social';

const denied=()=>Response.json({error:'Acesso restrito ao administrador.'},{status:403});

// Contas conectadas (vinculadas ou aguardando vínculo) e o estado da configuração da Meta.
export async function GET(req:Request){
  if(!isAdmin(req))return denied();
  const rows=(await database().prepare('SELECT id,client_id,network,external_id,name,username,picture,page_id,connected_at FROM social_accounts ORDER BY network,name').all()).results;
  return Response.json({meta:{ready:metaReady(),redirectUri:metaRedirectUri},accounts:rows},{headers:{'Cache-Control':'no-store'}});
}

// Vincula uma Página do Facebook (e o Instagram dela) a um cliente.
export async function POST(req:Request){
  if(!isAdmin(req)||!sameOrigin(req))return denied();
  const {accountId,clientId}=await req.json().catch(()=>({})) as {accountId?:string;clientId?:string};
  if(!accountId||!clientId)return Response.json({error:'Escolha a Página e o cliente.'},{status:400});
  if(!await database().prepare('SELECT id FROM clients WHERE id=?').bind(clientId).first())return Response.json({error:'Cliente inválido.'},{status:400});
  try{return Response.json({linked:await linkPageToClient(accountId,clientId)});}
  catch(e){return Response.json({error:e instanceof Error?e.message:'Não foi possível vincular.'},{status:409});}
}

// Desvincula (mode=unlink) ou apaga a conta e o token guardado (mode=remove).
export async function DELETE(req:Request){
  if(!isAdmin(req)||!sameOrigin(req))return denied();
  const {id,mode}=await req.json().catch(()=>({})) as {id?:string;mode?:string};
  if(!id)return Response.json({error:'Conta inválida.'},{status:400});
  const db=database();
  const busy=await db.prepare("SELECT t.id FROM publication_targets t WHERE t.account_id=? AND t.status IN ('queued','processing','publishing')").bind(id).first();
  if(busy)return Response.json({error:'Há publicações agendadas para esta conta. Cancele-as antes.'},{status:409});
  if(mode==='remove')await db.prepare('DELETE FROM social_accounts WHERE id=?').bind(id).run();
  else await db.prepare('UPDATE social_accounts SET client_id=NULL WHERE id=?').bind(id).run();
  return Response.json({ok:true});
}
