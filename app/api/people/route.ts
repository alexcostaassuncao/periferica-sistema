import {database} from '../../../db/raw';
import {currentUser,envAdmin} from '../../../lib/auth';

// Lista simples da equipe (nome e cargo) para escolher responsáveis e participantes.
export async function GET(req:Request){
  if(!currentUser(req))return Response.json({error:'Sem sessão.'},{status:401});
  const rows=(await database().prepare('SELECT id,name,role,access FROM users WHERE active=1 ORDER BY name').all()).results as any[];
  const admin=envAdmin();
  if(admin&&!rows.some(r=>r.id==='admin'))rows.unshift({id:'admin',name:admin.name,role:'Direção',access:'Administrador'});
  return Response.json({people:rows.map(r=>({id:r.id,name:r.name,role:r.role||r.access}))},{headers:{'Cache-Control':'no-store'}});
}
