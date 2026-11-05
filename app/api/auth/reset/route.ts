import {database} from '../../../../db/raw';
import {hashPassword,sameOrigin} from '../../../../lib/auth';
import {sha256} from '../../../../lib/session';

// Cria a nova senha a partir do link enviado por email. O link só pode ser usado uma vez.
export async function POST(req:Request){
  if(!sameOrigin(req))return Response.json({error:'Origem inválida.'},{status:403});
  const p:any=await req.json().catch(()=>({}));
  const token=String(p.token||''),password=String(p.password||'');
  if(!/^[0-9a-f]{64}$/.test(token))return Response.json({error:'Link inválido. Peça um novo em "Esqueci minha senha".'},{status:400});
  if(password.length<8||password.length>128)return Response.json({error:'A senha precisa ter pelo menos 8 caracteres.'},{status:400});
  const db=database(),now=Date.now();
  // Marca como usado na mesma operação que confere, para o link não servir duas vezes.
  const row=await db.prepare('UPDATE password_resets SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? RETURNING user_id').bind(now,await sha256(token),now).first<{user_id:string}>();
  if(!row)return Response.json({error:'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".'},{status:400});
  const r=await db.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(password),row.user_id).run();
  if(!r.meta.changes)return Response.json({error:'Cadastro não encontrado.'},{status:404});
  await db.prepare('DELETE FROM password_resets WHERE user_id=?').bind(row.user_id).run();
  return Response.json({ok:true});
}
