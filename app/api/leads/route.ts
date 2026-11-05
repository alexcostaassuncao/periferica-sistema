import {database} from '../../../db/raw';
import {canAccess,currentUser,sameOrigin} from '../../../lib/auth';
import {STAGES,owners} from '../../../db/crm';

// CRM comercial: leads, etapas do funil, espera e arquivados.
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const denied=()=>json({error:'Você não tem acesso ao Comercial.'},403);
const SITUATIONS=['andamento','espera','arquivado'];
const FIELDS:Record<string,number>={company:120,segment:80,source:40,contact_name:120,phone:40,email:200,interest:120,notes:4000,reason:200,return_at:20};

export async function GET(req:Request){
  if(!canAccess(req,'comercial'))return denied();
  const db=database();
  const leads=(await db.prepare(`SELECT l.*,(SELECT c.status FROM contracts c WHERE c.lead_id=l.id AND c.status<>'canc' ORDER BY c.created_at DESC LIMIT 1) AS contract_status,
    (SELECT c.id FROM contracts c WHERE c.lead_id=l.id AND c.status<>'canc' ORDER BY c.created_at DESC LIMIT 1) AS contract_id FROM leads l ORDER BY l.updated_at DESC`).all()).results;
  return json({leads,owners:await owners()});
}

export async function POST(req:Request){
  if(!canAccess(req,'comercial')||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  const company=String(p.company||'').trim().slice(0,120);
  if(company.length<2)return json({error:'Informe o nome da empresa.'},400);
  const id=crypto.randomUUID(),now=Date.now();
  const v=(k:string)=>String(p[k]||'').trim().slice(0,FIELDS[k]);
  await database().prepare(`INSERT INTO leads (id,company,segment,source,contact_name,phone,email,interest,notes,stage,situation,owner_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,'andamento',?,?,?)`).bind(id,company,v('segment'),v('source'),v('contact_name'),v('phone'),v('email'),v('interest'),v('notes'),
    STAGES.includes(p.stage)?p.stage:'novo',p.owner_id||null,now,now).run();
  return json({id});
}

export async function PATCH(req:Request){
  if(!canAccess(req,'comercial')||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  if(typeof p.id!=='string')return json({error:'Lead inválido.'},400);
  const sets:string[]=[],args:any[]=[];
  for(const [k,max] of Object.entries(FIELDS))if(typeof p[k]==='string'){
    if(k==='company'&&p[k].trim().length<2)return json({error:'Informe o nome da empresa.'},400);
    sets.push(k+'=?');args.push(p[k].trim().slice(0,max));
  }
  if(p.stage!==undefined){if(!STAGES.includes(p.stage))return json({error:'Etapa inválida.'},400);sets.push('stage=?');args.push(p.stage);}
  if(p.situation!==undefined){
    if(!SITUATIONS.includes(p.situation))return json({error:'Situação inválida.'},400);
    if(p.situation!=='andamento'&&!String(p.reason||'').trim())return json({error:'Informe o motivo.'},400);
    sets.push('situation=?');args.push(p.situation);
    if(p.situation==='andamento'){sets.push("reason=''","return_at=''");}
  }
  if(p.owner_id!==undefined){
    if(p.owner_id&&!(await owners()).some(o=>o.id===p.owner_id))return json({error:'Responsável inválido.'},400);
    sets.push('owner_id=?');args.push(p.owner_id||null);
  }
  if(!sets.length)return json({error:'Nada para alterar.'},400);
  const r=await database().prepare(`UPDATE leads SET ${sets.join(',')},updated_at=? WHERE id=?`).bind(...args,Date.now(),p.id).run();
  return r.meta.changes?json({ok:true,by:currentUser(req)?.name}):json({error:'Lead não encontrado.'},404);
}
