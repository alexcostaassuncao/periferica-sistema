import {database} from './raw';

// Conexão com a Meta pelo "Login do Facebook": um único login libera as Páginas do Facebook
// e as contas profissionais do Instagram vinculadas a elas. Os tokens de Página gerados a partir
// de um token de usuário de longa duração não expiram (até a senha mudar ou o acesso ser removido).
//
// Futuro: youtube e linkedin entram como novos valores de "network" em social_accounts.

const env=process.env;
export const GRAPH='https://graph.facebook.com/'+(env.META_GRAPH_VERSION||'v23.0');
export const siteOrigin=(env.SITE_URL||'http://localhost:3000').replace(/\/+$/,'');
export const metaRedirectUri=siteOrigin+'/api/social/meta/callback';
export const metaScopes=[
  'pages_show_list','pages_read_engagement','pages_manage_posts',
  'instagram_basic','instagram_content_publish','business_management',
];
export const NETWORKS=['facebook','instagram'] as const;
export type Network=typeof NETWORKS[number];

export function metaConfig(){return {id:env.META_APP_ID,secret:env.META_APP_SECRET,key:env.SOCIAL_TOKEN_KEY};}
export function metaReady(){const c=metaConfig();return Boolean(c.id&&c.secret&&c.key);}

// ---------- criptografia dos tokens (AES-GCM, chave de 32 bytes em base64 na SOCIAL_TOKEN_KEY) ----------
async function aesKey(usage:'encrypt'|'decrypt'){
  const raw=metaConfig().key;if(!raw)throw Error('Configuração incompleta: defina SOCIAL_TOKEN_KEY.');
  return crypto.subtle.importKey('raw',Uint8Array.from(atob(raw),v=>v.charCodeAt(0)),{name:'AES-GCM'},false,[usage]);
}
const b64=(u:Uint8Array)=>btoa(String.fromCharCode(...u));
const unb64=(s:string)=>Uint8Array.from(atob(s),v=>v.charCodeAt(0));
export async function encryptToken(token:string){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey('encrypt'),new TextEncoder().encode(token));
  return b64(iv)+'.'+b64(new Uint8Array(data));
}
export async function decryptToken(cipher:string){
  const [iv,data]=cipher.split('.');
  const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},await aesKey('decrypt'),unb64(data));
  return new TextDecoder().decode(clear);
}

// ---------- chamadas à Graph API ----------
export class MetaError extends Error{constructor(message:string,readonly code?:number,readonly transient=false){super(message);}}

export async function graph(path:string,token:string,params?:Record<string,string>,method?:'GET'|'POST'){
  const m=method||(params?'POST':'GET');
  const url=new URL(path.startsWith('http')?path:GRAPH+'/'+path.replace(/^\//,''));
  let body:URLSearchParams|undefined;
  if(m==='GET'&&params)for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  else if(params)body=new URLSearchParams(params);
  let r:Response;
  try{r=await fetch(url,{method:m,headers:{Authorization:'Bearer '+token},body,signal:AbortSignal.timeout(30000)});}
  catch{throw new MetaError('A Meta não respondeu a tempo.',undefined,true);}
  const d:any=await r.json().catch(()=>({}));
  if(!r.ok||d.error){
    const e=d.error||{};
    const transient=e.is_transient===true||[1,2,4,17,32,341,613].includes(e.code)||r.status>=500;
    throw new MetaError(friendlyMetaError(e),e.code,transient);
  }
  return d;
}

function friendlyMetaError(e:any){
  const code=e?.code,sub=e?.error_subcode;
  if(code===190)return 'O acesso à conta expirou ou foi revogado. Reconecte a conta em Configurações → Redes sociais.';
  if(code===10||code===200)return 'A conta não deu permissão para publicar. Reconecte e marque todas as permissões pedidas.';
  if(code===9004||sub===2207052)return 'A Meta não conseguiu baixar a mídia. Confira se o link é público e direto para o arquivo.';
  if(sub===2207026)return 'Formato de vídeo não aceito. Use MP4 (H.264/AAC), até 90 s para Reels e 60 s para Stories.';
  if(sub===2207009||sub===2207010)return 'Proporção da imagem não aceita pelo Instagram. Use entre 4:5 e 1,91:1 no feed, 9:16 em Stories/Reels.';
  if(code===4||code===17||code===32||code===613)return 'Limite de publicações da Meta atingido. Tentaremos de novo na próxima rodada.';
  if(code===368)return 'A Meta bloqueou temporariamente esta ação na conta. Tente mais tarde.';
  return 'A Meta recusou a operação'+(code?' (código '+code+(sub?'/'+sub:'')+')':'')+'. '+(e?.error_user_msg||'Confira a conta, as permissões e o formato da mídia.');
}

// ---------- login OAuth ----------
export function metaAuthorizeUrl(state:string){
  const u=new URL('https://www.facebook.com/'+(env.META_GRAPH_VERSION||'v23.0')+'/dialog/oauth');
  u.search=new URLSearchParams({client_id:metaConfig().id!,redirect_uri:metaRedirectUri,state,response_type:'code',scope:metaScopes.join(','),auth_type:'rerequest'}).toString();
  return u.toString();
}

export async function exchangeCode(code:string){
  const c=metaConfig();
  const shortUrl=new URL(GRAPH+'/oauth/access_token');
  shortUrl.search=new URLSearchParams({client_id:c.id!,client_secret:c.secret!,redirect_uri:metaRedirectUri,code}).toString();
  const r1=await fetch(shortUrl,{signal:AbortSignal.timeout(15000)});const short:any=await r1.json();
  if(!r1.ok||!short.access_token)throw Error('code');
  const longUrl=new URL(GRAPH+'/oauth/access_token');
  longUrl.search=new URLSearchParams({grant_type:'fb_exchange_token',client_id:c.id!,client_secret:c.secret!,fb_exchange_token:short.access_token}).toString();
  const r2=await fetch(longUrl,{signal:AbortSignal.timeout(15000)});const long:any=await r2.json();
  if(!r2.ok||!long.access_token)throw Error('exchange');
  return long.access_token as string;
}

type MetaPage={id:string;name:string;access_token:string;picture?:{data?:{url?:string}};instagram_business_account?:{id:string;username?:string;name?:string;profile_picture_url?:string}};

export async function listPages(userToken:string){
  const pages:MetaPage[]=[];
  let next:string|null=GRAPH+'/me/accounts?'+new URLSearchParams({fields:'id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}',limit:'100'});
  for(let i=0;next&&i<10;i++){const d:any=await graph(next,userToken);pages.push(...(d.data||[]));next=d.paging?.next||null;}
  return pages.filter(p=>p.id&&p.access_token);
}

// Salva (ou atualiza o token de) cada Página e Instagram encontrados. Não muda o cliente de contas já vinculadas.
export async function saveMetaAccounts(pages:MetaPage[],userId:string){
  const db=database();const now=new Date().toISOString();const saved:{id:string;network:Network;client_id:string|null}[]=[];
  for(const p of pages){
    const cipher=await encryptToken(p.access_token);
    const rows:[Network,string,string,string,string,string|null][]=[['facebook',p.id,p.name,'',p.picture?.data?.url||'',null]];
    const ig=p.instagram_business_account;
    if(ig?.id)rows.push(['instagram',ig.id,ig.name||ig.username||'',ig.username||'',ig.profile_picture_url||'',p.id]);
    for(const [network,ext,name,username,picture,pageId] of rows){
      const id=network+':'+ext;
      const row:any=await db.prepare(`INSERT INTO social_accounts (id,network,external_id,name,username,picture,page_id,token_cipher,expires_at,connected_by,connected_at)
        VALUES (?,?,?,?,?,?,?,?,NULL,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,username=excluded.username,picture=excluded.picture,page_id=excluded.page_id,token_cipher=excluded.token_cipher,expires_at=NULL,connected_by=excluded.connected_by,connected_at=excluded.connected_at
        RETURNING id,network,client_id`).bind(id,network,ext,name,username,picture,pageId,cipher,userId,now).first();
      if(row)saved.push(row);
    }
  }
  return saved;
}

// Vincula uma Página (e o Instagram dela, se houver) a um cliente. Cada cliente tem no máximo uma conta por rede.
export async function linkPageToClient(facebookAccountId:string,clientId:string){
  const db=database();
  const fb:any=await db.prepare("SELECT id,external_id,client_id FROM social_accounts WHERE id=? AND network='facebook'").bind(facebookAccountId).first();
  if(!fb)throw Error('Página não encontrada. Conecte novamente.');
  if(fb.client_id&&fb.client_id!==clientId)throw Error('Esta Página já está vinculada a outro cliente. Desvincule lá primeiro.');
  const ig:any=await db.prepare("SELECT id,client_id FROM social_accounts WHERE network='instagram' AND page_id=?").bind(fb.external_id).first();
  if(ig?.client_id&&ig.client_id!==clientId)throw Error('O Instagram desta Página já está vinculado a outro cliente.');
  const ids=[fb.id,...(ig?[ig.id]:[])];
  const busy:any=await db.prepare(`SELECT network FROM social_accounts WHERE client_id=? AND id NOT IN (${ids.map(()=>'?').join(',')}) AND network IN ('facebook'${ig?",'instagram'":''})`).bind(clientId,...ids).first();
  if(busy)throw Error('Este cliente já tem '+(busy.network==='facebook'?'uma Página do Facebook':'um Instagram')+' vinculado. Desvincule o atual antes de trocar.');
  await db.batch(ids.map(id=>db.prepare('UPDATE social_accounts SET client_id=? WHERE id=?').bind(clientId,id)));
  return ids;
}

export async function accountToken(accountId:string){
  const row:any=await database().prepare('SELECT * FROM social_accounts WHERE id=?').bind(accountId).first();
  if(!row)throw new MetaError('A conta foi desconectada. Reconecte em Configurações → Redes sociais.');
  if(row.expires_at&&row.expires_at<=Date.now())throw new MetaError('O acesso à conta expirou. Reconecte em Configurações → Redes sociais.');
  return {account:row,token:await decryptToken(row.token_cipher)};
}

export function back(status:string,clientId?:string){
  const q=new URLSearchParams({social:status});if(clientId)q.set('client',clientId);
  return new Response(null,{status:303,headers:{Location:siteOrigin+'/configuracoes.html?'+q,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
