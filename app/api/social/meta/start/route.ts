import {database} from '../../../../../db/raw';
import {currentUser} from '../../../../../lib/auth';
import {back,metaAuthorizeUrl,metaReady} from '../../../../../db/social';

// Inicia o login do Facebook para conectar as Páginas/Instagram de um cliente.
export async function GET(req:Request){
  const user=currentUser(req);
  if(!user?.admin)return back('denied');
  if(!metaReady())return back('configuration');
  const clientId=new URL(req.url).searchParams.get('client')||'';
  const db=database();
  if(!clientId||!await db.prepare('SELECT id FROM clients WHERE id=?').bind(clientId).first())return back('client');
  const state=crypto.randomUUID()+crypto.randomUUID();
  await db.prepare('DELETE FROM social_states WHERE expires_at<?').bind(Date.now()).run();
  await db.prepare('INSERT INTO social_states (state,network,client_id,owner,expires_at) VALUES (?,?,?,?,?)').bind(state,'meta',clientId,user.id,Date.now()+600000).run();
  return new Response(null,{status:302,headers:{Location:metaAuthorizeUrl(state),'Cache-Control':'no-store'}});
}
