import {database} from '../../../../db/raw';
import {envAdmin,envAdminVersion,passwordVersion,verifyPassword,sameOrigin} from '../../../../lib/auth';
import {sessionCookie,signSession} from '../../../../lib/session';

const MAX_FAILURES=10,WINDOW=15*60*1000;
const denied=()=>Response.json({error:'Email ou senha incorretos.'},{status:401});
async function blocked(key:string){const row:any=await database().prepare('SELECT failures,reset_at FROM login_attempts WHERE key=?').bind(key).first();return !!row&&row.reset_at>Date.now()&&row.failures>=MAX_FAILURES;}
async function fail(key:string){const now=Date.now();await database().prepare('INSERT INTO login_attempts (key,failures,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN login_attempts.reset_at<? THEN 1 ELSE login_attempts.failures+1 END,reset_at=CASE WHEN login_attempts.reset_at<? THEN excluded.reset_at ELSE login_attempts.reset_at END').bind(key,now+WINDOW,now,now).run();}

export async function POST(req:Request){
  if(!sameOrigin(req))return Response.json({error:'Origem inválida.'},{status:403});
  try{
    const p:any=await req.json();
    const email=String(p.email||'').trim().toLowerCase(),password=String(p.password||'');
    if(!email||!password||password.length>128)return denied();
    const key='email:'+email;
    if(await blocked(key))return Response.json({error:'Muitas tentativas. Aguarde 15 minutos e tente novamente.'},{status:429});
    const admin=envAdmin();
    const row:any=await database().prepare('SELECT id,password_hash FROM users WHERE email=?').bind(email).first();
    let token:string|null=null;
    // Depois que o administrador redefine a senha, vale a do banco (a da Vercel deixa de valer).
    if(admin&&email===admin.email&&!row?.password_hash&&password===admin.password)token=await signSession({uid:'admin',m:'env',pv:await envAdminVersion()});
    else if(row?.password_hash&&await verifyPassword(password,row.password_hash))token=await signSession({uid:row.id,m:'db',pv:await passwordVersion(row.password_hash)});
    if(!token){
      await fail(key);
      if(!admin&&!row)return Response.json({error:'O login do administrador ainda não foi configurado. Defina ADMIN_EMAIL e ADMIN_PASSWORD na Vercel e faça Redeploy.'},{status:503});
      return denied();
    }
    await database().prepare('DELETE FROM login_attempts WHERE key=?').bind(key).run();
    return Response.json({ok:true},{headers:{'Set-Cookie':sessionCookie(token),'Cache-Control':'no-store'}});
  }catch(e){console.error(e);return Response.json({error:'Não foi possível entrar agora. Tente novamente.'},{status:503});}
}
