import {database} from '../../../db/raw';
import {canAccess,currentUser,envAdmin,hashPassword,sameOrigin} from '../../../lib/auth';
import {AREAS,PROFILES,PROTECTED_PROFILES,cleanAreas} from '../../../lib/access';
import {sha256} from '../../../lib/session';
import {mailReady,sendMail} from '../../../lib/mail';
import {siteOrigin} from '../../../db/social';

// Cadastro de usuários e acessos (aba Equipe). Só quem tem a área "equipe" (ou o administrador).
// Quem não é administrador não pode criar nem alterar administradores.
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const denied=()=>json({error:'Você não tem acesso ao cadastro de usuários.'},403);
const emailOk=(e:string)=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)&&e.length<=200;

async function invite(userId:string,name:string,email:string){
  if(!mailReady())return false;
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const db=database();
  await db.batch([
    db.prepare('DELETE FROM password_resets WHERE user_id=?').bind(userId),
    db.prepare('INSERT INTO password_resets (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await sha256(token),userId,Date.now()+7*86400000),
  ]);
  return sendMail({to:email,subject:'Seu acesso ao sistema da Periférica',text:
`Olá, ${name}!

Você ganhou acesso ao sistema da Periférica. Para começar, crie a sua senha neste link (vale por 7 dias):

${siteOrigin}/redefinir-senha.html?token=${token}

Depois é só entrar em ${siteOrigin} com o seu email: ${email}`});
}

export async function GET(req:Request){
  if(!canAccess(req,'equipe'))return denied();
  const rows=(await database().prepare('SELECT id,name,email,role,access,areas,squads,active,created_at,password_hash IS NOT NULL AS has_password FROM users ORDER BY active DESC,name').all()).results as any[];
  const users=rows.map(r=>({...r,areas:JSON.parse(r.areas||'[]'),active:!!r.active,has_password:!!r.has_password}));
  const admin=envAdmin();
  // Administrador da Vercel aparece na lista mesmo sem cadastro no banco.
  if(admin&&!users.some(u=>u.email===admin.email))users.unshift({id:'admin',name:admin.name,email:admin.email,role:'Direção',access:'Administrador',areas:[],squads:'',active:true,has_password:true,env:true});
  return json({users,areas:AREAS,profiles:PROFILES,mail:mailReady(),me:currentUser(req)?.id});
}

export async function POST(req:Request){
  if(!canAccess(req,'equipe')||!sameOrigin(req))return denied();
  const me=currentUser(req)!;
  const p:any=await req.json().catch(()=>({}));
  const name=String(p.name||'').trim().slice(0,120),email=String(p.email||'').trim().toLowerCase();
  const access=Object.keys(PROFILES).includes(p.access)?p.access:'Personalizado';
  if(name.length<2)return json({error:'Informe o nome.'},400);
  if(!emailOk(email))return json({error:'Informe um email válido.'},400);
  if(PROTECTED_PROFILES.includes(access)&&!me.admin)return json({error:'Só um administrador pode criar um '+access.toLowerCase()+'.'},403);
  const password=String(p.password||'');
  if(password&&(password.length<8||password.length>128))return json({error:'A senha inicial precisa ter pelo menos 8 caracteres.'},400);
  if(!password&&!p.invite)return json({error:'Defina uma senha inicial ou marque "Enviar convite por email".'},400);
  const db=database();
  if(await db.prepare('SELECT id FROM users WHERE email=?').bind(email).first()||envAdmin()?.email===email)return json({error:'Já existe um usuário com este email.'},409);
  const id=crypto.randomUUID();
  await db.prepare('INSERT INTO users (id,name,email,role,access,password_hash,areas,squads,active,created_at) VALUES (?,?,?,?,?,?,?,?,1,?)')
    .bind(id,name,email,String(p.role||'').slice(0,80),access,password?await hashPassword(password):null,JSON.stringify(cleanAreas(p.areas)),String(p.squads||'').slice(0,40),new Date().toISOString()).run();
  let invited=false;
  if(p.invite)invited=await invite(id,name,email);
  return json({id,invited,inviteFailed:!!p.invite&&!invited});
}

export async function PATCH(req:Request){
  if(!canAccess(req,'equipe')||!sameOrigin(req))return denied();
  const me=currentUser(req)!;
  const p:any=await req.json().catch(()=>({}));
  const db=database();
  const user:any=await db.prepare('SELECT id,name,email,access FROM users WHERE id=?').bind(p.id).first();
  if(!user)return json({error:'Usuário não encontrado. O administrador da Vercel é alterado só nas variáveis da Vercel.'},404);
  if(PROTECTED_PROFILES.includes(user.access)&&!me.admin)return json({error:'Só um administrador pode alterar este usuário.'},403);
  if(p.action==='invite'){
    const ok=await invite(user.id,user.name,user.email);
    return ok?json({ok:true}):json({error:mailReady()?'Não foi possível enviar o email agora.':'O envio de emails ainda não foi configurado na Vercel.'},502);
  }
  const sets:string[]=[],args:any[]=[];
  if(typeof p.name==='string'&&p.name.trim().length>=2){sets.push('name=?');args.push(p.name.trim().slice(0,120));}
  if(typeof p.role==='string'){sets.push('role=?');args.push(p.role.slice(0,80));}
  if(typeof p.access==='string'){
    const access=Object.keys(PROFILES).includes(p.access)?p.access:'Personalizado';
    if(PROTECTED_PROFILES.includes(access)&&!me.admin)return json({error:'Só um administrador pode dar o perfil '+access+'.'},403);
    if(user.id===me.id&&user.access==='Administrador'&&access!=='Administrador')return json({error:'Você não pode tirar o seu próprio acesso de administrador.'},400);
    sets.push('access=?');args.push(access);
  }
  if(p.areas!==undefined){sets.push('areas=?');args.push(JSON.stringify(cleanAreas(p.areas)));}
  if(typeof p.squads==='string'){sets.push('squads=?');args.push(p.squads.slice(0,40));}
  if(typeof p.active==='boolean'){
    if(user.id===me.id&&!p.active)return json({error:'Você não pode desativar o seu próprio acesso.'},400);
    sets.push('active=?');args.push(p.active?1:0);
  }
  if(typeof p.password==='string'&&p.password){
    if(p.password.length<8||p.password.length>128)return json({error:'A senha precisa ter pelo menos 8 caracteres.'},400);
    sets.push('password_hash=?');args.push(await hashPassword(p.password));
  }
  if(!sets.length)return json({error:'Nada para alterar.'},400);
  await db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).bind(...args,user.id).run();
  return json({ok:true});
}
