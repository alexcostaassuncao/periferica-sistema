import {database} from '../../../../db/raw';
import {envAdmin,sameOrigin} from '../../../../lib/auth';
import {sha256} from '../../../../lib/session';
import {mailReady,sendMail} from '../../../../lib/mail';
import {siteOrigin} from '../../../../db/social';

// "Esqueci minha senha": envia por email um link que vale 30 minutos.
// A resposta é sempre a mesma, exista ou não o email, para não revelar quem tem cadastro.
const LIMIT=5,WINDOW=60*60*1000,VALID=30*60*1000;
const generic=()=>Response.json({ok:true,message:'Se este email tiver cadastro, enviamos um link para criar uma nova senha. Confira também a caixa de spam.'});

export async function POST(req:Request){
  if(!sameOrigin(req))return Response.json({error:'Origem inválida.'},{status:403});
  if(!mailReady())return Response.json({error:'O envio de emails ainda não foi configurado. Fale com a direção.'},{status:503});
  const p:any=await req.json().catch(()=>({}));
  const email=String(p.email||'').trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>200)return Response.json({error:'Digite um email válido.'},{status:400});
  const db=database(),now=Date.now(),key='forgot:'+email;

  // Limite de pedidos por email (evita encher a caixa de alguém).
  const att:any=await db.prepare('SELECT failures,reset_at FROM login_attempts WHERE key=?').bind(key).first();
  if(att&&att.reset_at>now&&att.failures>=LIMIT)return generic();
  await db.prepare('INSERT INTO login_attempts (key,failures,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN login_attempts.reset_at<? THEN 1 ELSE login_attempts.failures+1 END,reset_at=CASE WHEN login_attempts.reset_at<? THEN excluded.reset_at ELSE login_attempts.reset_at END').bind(key,now+WINDOW,now,now).run();

  let user:any=await db.prepare('SELECT id,name FROM users WHERE email=?').bind(email).first();
  // O administrador principal vem das variáveis da Vercel; na primeira redefinição ele ganha um cadastro no banco.
  const admin=envAdmin();
  if(!user&&admin&&email===admin.email){
    await db.prepare("INSERT INTO users (id,name,email,role,access,password_hash,created_at) VALUES ('admin',?,?,'Direção','Administrador',NULL,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email").bind(admin.name,email,new Date().toISOString()).run();
    user={id:'admin',name:admin.name};
  }
  if(!user)return generic();

  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  await db.batch([
    db.prepare('DELETE FROM password_resets WHERE user_id=? OR expires_at<?').bind(user.id,now),
    db.prepare('INSERT INTO password_resets (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await sha256(token),user.id,now+VALID),
  ]);
  const link=siteOrigin+'/redefinir-senha.html?token='+token;
  const sent=await sendMail({to:email,subject:'Redefinir sua senha – Periférica',text:
`Olá, ${user.name||''}!

Recebemos um pedido para criar uma nova senha no sistema da Periférica.
Clique no link abaixo (ele vale por 30 minutos):

${link}

Se não foi você, é só ignorar este email. Sua senha atual continua a mesma.`});
  if(!sent)return Response.json({error:'Não foi possível enviar o email agora. Tente de novo em alguns minutos.'},{status:502});
  return generic();
}
