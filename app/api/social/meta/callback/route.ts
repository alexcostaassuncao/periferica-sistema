import {database} from '../../../../../db/raw';
import {currentUser} from '../../../../../lib/auth';
import {back,exchangeCode,linkPageToClient,listPages,metaReady,saveMetaAccounts} from '../../../../../db/social';

// Volta do login do Facebook: troca o código por um token de longa duração, salva as Páginas
// e os Instagrams encontrados e, se houver uma única Página livre, já vincula ao cliente.
export async function GET(req:Request){
  const user=currentUser(req);
  if(!user?.admin)return back('denied');
  const url=new URL(req.url);
  const state=url.searchParams.get('state');
  if(!state||!metaReady())return back('configuration');
  const consumed=await database().prepare("DELETE FROM social_states WHERE state=? AND owner=? AND network='meta' AND expires_at>? RETURNING client_id").bind(state,user.id,Date.now()).first<{client_id:string}>();
  if(!consumed)return back('state');
  const clientId=consumed.client_id;
  if(url.searchParams.has('error'))return back('cancelled',clientId);
  const code=url.searchParams.get('code');
  if(!code)return back('failed',clientId);
  try{
    const token=await exchangeCode(code);
    const pages=await listPages(token);
    if(!pages.length)return back('no_pages',clientId);
    const saved=await saveMetaAccounts(pages,user.id);
    const free=saved.filter(a=>a.network==='facebook'&&(!a.client_id||a.client_id===clientId));
    if(free.length===1){
      try{await linkPageToClient(free[0].id,clientId);return back('connected',clientId);}catch{return back('choose',clientId);}
    }
    return back('choose',clientId);
  }catch(e){console.error(e);return back('failed',clientId);}
}
