// Sessão de login guardada num cookie assinado (HMAC-SHA256). Não usa tabela no banco.
export const SESSION_COOKIE='periferica_session';
export const SESSION_MAX_AGE=7*24*60*60; // 7 dias, em segundos

export type SessionPayload={
  uid:string;      // id do funcionário
  m:'env'|'db';    // env = administrador definido nas variáveis da Vercel; db = funcionário cadastrado
  pv:string;       // versão da senha: trocar a senha invalida as sessões antigas
  exp:number;      // expiração (ms)
};

const encoder=new TextEncoder();
function secret(){
  const value=process.env.SESSION_SECRET;
  if(value&&value.length>=32)return value;
  if(process.env.NODE_ENV==='production')throw Error('Defina SESSION_SECRET (pelo menos 32 caracteres) nas variáveis de ambiente.');
  return 'periferica-dev-secret-only-for-local-development';
}
const b64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromB64url=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function hmac(data:string){
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret()),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(data))));
}
function sameText(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}

export async function sha256(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');}

export async function signSession(payload:Omit<SessionPayload,'exp'>){
  const body=b64url(encoder.encode(JSON.stringify({...payload,exp:Date.now()+SESSION_MAX_AGE*1000})));
  return body+'.'+await hmac(body);
}

export async function readSession(token:string|undefined):Promise<SessionPayload|null>{
  if(!token)return null;
  const [body,signature]=token.split('.');
  if(!body||!signature||!sameText(signature,await hmac(body)))return null;
  try{
    const payload=JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if(typeof payload.uid!=='string'||typeof payload.pv!=='string'||!['env','db'].includes(payload.m)||!(payload.exp>Date.now()))return null;
    return payload;
  }catch{return null;}
}

export function sessionCookie(value:string,maxAge=SESSION_MAX_AGE){
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`;
}
