import {database} from './raw';
import {envAdmin} from '../lib/auth';

export const STAGES=['novo','contato','reuniao','proposta','negociacao','fechado'];

// Pessoas que podem ser responsáveis por um lead (quem tem acesso ao Comercial).
export async function owners(){
  const rows=(await database().prepare("SELECT id,name,access,areas FROM users WHERE active=1 ORDER BY name").all()).results as any[];
  const list=rows.filter(r=>r.access==='Administrador'||String(r.areas).includes('"comercial"')).map(r=>({id:r.id as string,name:r.name as string}));
  const admin=envAdmin();
  if(admin&&!list.some(o=>o.id==='admin'))list.unshift({id:'admin',name:admin.name});
  return list;
}
