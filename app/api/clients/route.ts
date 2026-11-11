import {database} from '../../../db/raw';
import {canAccess,sameOrigin} from '../../../lib/auth';

// Lista os clientes com as redes sociais vinculadas a cada um.
export async function GET(){
  const db=database();
  const clients=(await db.prepare('SELECT id,name,segment,squad,services,status,phase,created_at,contact_name,phone,email,lead_id FROM clients ORDER BY name').all()).results;
  const accounts=(await db.prepare('SELECT id,client_id,network,name,username,picture FROM social_accounts WHERE client_id IS NOT NULL').all()).results as any[];
  return Response.json({clients:clients.map((c:any)=>({...c,social:accounts.filter(a=>a.client_id===c.id)}))},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(req:Request){
  if(!canAccess(req,'clientes')||!sameOrigin(req))return Response.json({error:'Você não tem acesso ao cadastro de clientes.'},{status:403});
  const p:any=await req.json().catch(()=>({}));
  const name=String(p.name||'').trim().slice(0,120);
  if(name.length<2)return Response.json({error:'Informe o nome do cliente.'},{status:400});
  const squad=['C1','C2','C3'].includes(p.squad)?p.squad:'';
  const id=crypto.randomUUID();
  await database().prepare('INSERT INTO clients (id,name,segment,squad,services,status,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id,name,String(p.segment||'').slice(0,80),squad,String(p.services||'').slice(0,200),'ativo',new Date().toISOString()).run();
  return Response.json({id});
}

// Atualiza campos do cliente (squad, status, segmento, serviços, nome).
export async function PATCH(req:Request){
  if(!canAccess(req,'clientes')||!sameOrigin(req))return Response.json({error:'Você não tem acesso ao cadastro de clientes.'},{status:403});
  const p:any=await req.json().catch(()=>({}));
  const sets:string[]=[],args:any[]=[];
  if(typeof p.name==='string'&&p.name.trim().length>=2){sets.push('name=?');args.push(p.name.trim().slice(0,120));}
  if(typeof p.segment==='string'){sets.push('segment=?');args.push(p.segment.slice(0,80));}
  if(typeof p.services==='string'){sets.push('services=?');args.push(p.services.slice(0,200));}
  if(['','C1','C2','C3'].includes(p.squad)){sets.push('squad=?');args.push(p.squad);}
  if(['ativo','inativo','pausado'].includes(p.status)){sets.push('status=?');args.push(p.status);}
  for(const [k,max] of [['contact_name',120],['phone',40],['email',200]] as const)if(typeof p[k]==='string'){sets.push(k+'=?');args.push(p[k].trim().slice(0,max));}
  if(!p.id||!sets.length)return Response.json({error:'Nada para atualizar.'},{status:400});
  const r=await database().prepare(`UPDATE clients SET ${sets.join(',')} WHERE id=?`).bind(...args,p.id).run();
  return r.meta.changes?Response.json({ok:true}):Response.json({error:'Cliente não encontrado.'},{status:404});
}
