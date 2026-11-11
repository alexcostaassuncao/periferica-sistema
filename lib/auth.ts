import {database} from '../db/raw';
import {readSession,sha256,type SessionPayload} from './session';
import {AREA_KEYS,DEV_PROFILES} from './access';

export type SessionUser={id:string;name:string;email:string;access:string;admin:boolean;areas:string[];squads:string[]};

// O administrador principal vem das variáveis ADMIN_EMAIL e ADMIN_PASSWORD (configuradas na Vercel).
// Assim sempre existe um acesso, mesmo com o banco vazio.
export function envAdmin(){
  const email=(process.env.ADMIN_EMAIL||'').trim().toLowerCase(),password=process.env.ADMIN_PASSWORD||'';
  return email&&password.length>=8?{email,password,name:process.env.ADMIN_NAME||'Administrador'}:null;
}
export async function envAdminVersion(){const a=envAdmin();return a?(await sha256('env:'+a.email+':'+a.password)).slice(0,24):'';}
export async function passwordVersion(hash:string){return (await sha256('db:'+hash)).slice(0,24);}

export async function hashPassword(password:string){
  const salt=crypto.randomUUID().replace(/-/g,''),iterations=210000;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations},key,256);
  return ['pbkdf2',iterations,salt,Array.from(new Uint8Array(bits),v=>v.toString(16).padStart(2,'0')).join('')].join(':');
}

export async function verifyPassword(password:string,stored:string|null|undefined){
  const [kind,iterations,salt,expected]=String(stored||'').split(':');
  if(kind!=='pbkdf2'||!salt||!expected)return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:Number(iterations)},key,256);
  const actual=Array.from(new Uint8Array(bits),v=>v.toString(16).padStart(2,'0')).join('');
  if(actual.length!==expected.length)return false;
  let diff=0;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}

// Confere a sessão contra o banco a cada requisição: usuário removido ou senha trocada perdem o acesso na hora.
export async function userFromSession(session:SessionPayload|null):Promise<SessionUser|null>{
  if(!session)return null;
  if(session.m==='env'){
    const admin=envAdmin();
    if(!admin||session.uid!=='admin'||session.pv!==await envAdminVersion())return null;
    return {id:'admin',name:admin.name,email:admin.email,access:'Administrador',admin:true,areas:AREA_KEYS,squads:[]};
  }
  const row:any=await database().prepare('SELECT id,name,email,access,password_hash,areas,squads,active FROM users WHERE id=?').bind(session.uid).first();
  if(!row||!row.password_hash||!row.active||session.pv!==await passwordVersion(row.password_hash))return null;
  const admin=row.access==='Administrador';
  let areas:string[]=[];try{areas=JSON.parse(row.areas||'[]');}catch{}
  return {id:row.id,name:row.name,email:row.email||'',access:row.access,admin,areas:admin||row.access==='Desenvolvedor'?AREA_KEYS:areas,
    squads:String(row.squads||'').split(/[,\s]+/).filter(x=>/^C\d$/.test(x))};
}

export async function userFromToken(token:string|undefined){return userFromSession(await readSession(token));}

// Lê o usuário repassado pelo proxy.ts (cabeçalhos recriados a cada requisição, nunca aceitos do navegador).
export function currentUser(req:Request){
  const h=req.headers;const id=h.get('x-pf-user-id');
  if(!id)return null;
  const admin=h.get('x-pf-admin')==='1';
  return {id,name:decodeURIComponent(h.get('x-pf-user-name')||''),email:decodeURIComponent(h.get('x-pf-user-email')||''),admin,
    access:decodeURIComponent(h.get('x-pf-access')||''),areas:(h.get('x-pf-areas')||'').split(',').filter(Boolean),
    squads:(h.get('x-pf-squads')||'').split(',').filter(Boolean)};
}
export function isAdmin(req:Request){return currentUser(req)?.admin===true;}
// Usuário logado com acesso à área (o administrador tem todas).
export function canAccess(req:Request,area:string){const u=currentUser(req);return !!u&&(u.admin||u.areas.includes(area));}
export function sameOrigin(req:Request){return req.headers.get('Origin')===new URL(req.url).origin;}
// Administrador ou Desenvolvedor: pode usar o modo desenvolvedor.
export function isDev(req:Request){const u=currentUser(req);return !!u&&(u.admin||DEV_PROFILES.includes(u.access));}
