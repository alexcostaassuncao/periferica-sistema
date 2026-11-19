import {database} from '../../../db/raw';
import {canAccess,sameOrigin} from '../../../lib/auth';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const denied=()=>json({error:'Você não tem acesso ao Comercial.'},403);
const FIELDS:Record<string,number>={code:40,platform:60,campaign_name:120,ad_name:120,campaign_id:120,ad_id:120,form_id:120,
  utm_source:120,utm_medium:120,utm_campaign:120,utm_content:120,utm_term:120,gclid:300,fbclid:300};
const keys=Object.keys(FIELDS);
const value=(p:Record<string,unknown>,key:string)=>String(p[key]??'').trim().slice(0,FIELDS[key]);

export async function GET(req:Request){
  if(!canAccess(req,'comercial'))return denied();
  const db=database(),code=new URL(req.url).searchParams.get('code')?.trim();
  if(code){
    const row=await db.prepare('SELECT * FROM lead_reference_codes WHERE lower(code)=lower(?) AND active=1').bind(code).first();
    return row?json({reference:row}):json({error:`O código "${code}" não existe ou está inativo.`},404);
  }
  const references=(await db.prepare('SELECT * FROM lead_reference_codes ORDER BY active DESC,created_at DESC').all()).results;
  return json({references});
}

export async function POST(req:Request){
  if(!canAccess(req,'comercial')||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  const code=value(p,'code').toUpperCase();
  if(!/^[A-Z0-9_-]{2,40}$/.test(code))return json({error:'Use um código de 2 a 40 caracteres (letras, números, hífen ou sublinhado).'},400);
  if(!value(p,'platform')||!value(p,'campaign_name'))return json({error:'Informe a plataforma e a campanha.'},400);
  const now=Date.now(),id=crypto.randomUUID();
  try{
    await database().prepare(`INSERT INTO lead_reference_codes(id,code,platform,campaign_name,ad_name,campaign_id,ad_id,form_id,
      utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,fbclid,active,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).bind(id,code,...keys.slice(1).map(k=>value(p,k)),now,now).run();
    return json({id});
  }catch(e){
    if(String(e).includes('UNIQUE constraint failed'))return json({error:'Esse código já está cadastrado.'},409);
    console.error('Não foi possível cadastrar o código de origem.',e);
    return json({error:'Não foi possível salvar o código de origem.'},500);
  }
}

export async function PATCH(req:Request){
  if(!canAccess(req,'comercial')||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  if(typeof p.id!=='string')return json({error:'Código inválido.'},400);
  if(p.platform!==undefined&&!value(p,'platform'))return json({error:'Informe a plataforma.'},400);
  if(p.campaign_name!==undefined&&!value(p,'campaign_name'))return json({error:'Informe a campanha.'},400);
  if(p.active!==undefined&&typeof p.active!=='boolean')return json({error:'Status inválido.'},400);
  const sets:string[]=[],args:unknown[]=[];
  for(const key of keys)if(typeof p[key]==='string'){
    const next=value(p,key);
    if(key==='code'&&!/^[A-Z0-9_-]{2,40}$/i.test(next))return json({error:'Código de origem inválido.'},400);
    sets.push(key+'=?');args.push(key==='code'?next.toUpperCase():next);
  }
  if(p.active!==undefined){sets.push('active=?');args.push(p.active?1:0);}
  if(!sets.length)return json({error:'Nada para alterar.'},400);
  sets.push('updated_at=?');args.push(Date.now(),p.id);
  try{
    const result=await database().prepare(`UPDATE lead_reference_codes SET ${sets.join(',')} WHERE id=?`).bind(...args).run();
    return result.meta.changes?json({ok:true}):json({error:'Código não encontrado.'},404);
  }catch(e){
    if(String(e).includes('UNIQUE constraint failed'))return json({error:'Esse código já está cadastrado.'},409);
    console.error('Não foi possível atualizar o código de origem.',e);
    return json({error:'Não foi possível atualizar o código de origem.'},500);
  }
}

export async function DELETE(req:Request){
  if(!canAccess(req,'comercial')||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  if(typeof p.id!=='string')return json({error:'Código inválido.'},400);
  const result=await database().prepare('UPDATE lead_reference_codes SET active=0,updated_at=? WHERE id=?').bind(Date.now(),p.id).run();
  return result.meta.changes?json({ok:true}):json({error:'Código não encontrado.'},404);
}
