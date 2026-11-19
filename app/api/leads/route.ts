import {database} from '../../../db/raw';
import {canAccess,currentUser,sameOrigin} from '../../../lib/auth';
import {STAGES,owners} from '../../../db/crm';

// CRM comercial: leads, etapas do funil, espera e arquivados.
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const denied=()=>json({error:'Você não tem acesso ao Comercial.'},403);
const SITUATIONS=['andamento','espera','arquivado'];
const FIELDS:Record<string,number>={company:120,segment:80,source:60,contact_name:120,phone:40,email:200,interest:120,notes:4000,reason:200,return_at:20,
  utm_source:120,utm_medium:120,utm_campaign:120,utm_content:120,utm_term:120,gclid:300,fbclid:300,lead_source:30,platform:60,
  campaign_name:120,ad_name:120,reference_code:40};
const ATTRIBUTION_FIELDS=['source','utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','lead_source',
  'platform','campaign_name','ad_name','reference_code','attribution_method','conversion_at'] as const;
const METHODS=['automatic','integration','manual'];
const CHANNELS=['manual','form','whatsapp','meta_form','whatsapp_api','integration'];

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
  const conversionAt=p.conversion_at?Date.parse(String(p.conversion_at)):now;
  if(!Number.isFinite(conversionAt))return json({error:'Data da conversão inválida.'},400);
  if(p.attribution_method!==undefined&&!METHODS.includes(p.attribution_method))return json({error:'Método de identificação inválido.'},400);
  if(p.lead_source!==undefined&&!CHANNELS.includes(p.lead_source))return json({error:'Canal de entrada inválido.'},400);
  const v=(k:string)=>String(p[k]||'').trim().slice(0,FIELDS[k]);
  const db=database(),code=String(p.reference_code||p.campaign_code||'').trim();
  let reference:any=null;
  if(code){
    reference=await db.prepare('SELECT * FROM lead_reference_codes WHERE lower(code)=lower(?) AND active=1').bind(code).first();
    if(!reference)return json({error:`O código "${code}" não existe ou está inativo. Corrija o código antes de salvar.`},400);
  }
  const attribution=(key:string)=>v(key)||(reference?.[key]||'');
  const method=p.attribution_method||'manual';
  const leadSource=reference?'whatsapp':CHANNELS.includes(p.lead_source)
    ?(p.lead_source==='manual'&&v('source')==='WhatsApp'?'whatsapp':p.lead_source)
    :(v('source')==='WhatsApp'?'whatsapp':'manual');
  const raw=reference?JSON.stringify({reference:{campaign_id:reference.campaign_id,ad_id:reference.ad_id,form_id:reference.form_id}}):'{}';
  const attributionValues={
    source:reference?(v('source')||'WhatsApp'):v('source'),
    utm_source:attribution('utm_source'),utm_medium:attribution('utm_medium'),utm_campaign:attribution('utm_campaign'),
    utm_content:attribution('utm_content'),utm_term:attribution('utm_term'),gclid:attribution('gclid'),fbclid:attribution('fbclid'),
    lead_source:leadSource,platform:attribution('platform'),campaign_name:attribution('campaign_name'),
    ad_name:attribution('ad_name'),reference_code:reference?.code||'',attribution_method:method,conversion_at:String(conversionAt),
  };
  const operations=[db.prepare(`INSERT INTO leads (id,company,segment,source,contact_name,phone,email,interest,notes,stage,situation,owner_id,
    created_at,updated_at,utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,fbclid,lead_source,platform,campaign_name,
    ad_name,reference_code,attribution_method,conversion_at,attribution_raw)
    VALUES (?,?,?,?,?,?,?,?,?,?,'andamento',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,company,v('segment'),attributionValues.source,
    v('contact_name'),v('phone'),v('email'),v('interest'),v('notes'),STAGES.includes(p.stage)?p.stage:'novo',p.owner_id||null,now,now,
    attributionValues.utm_source,attributionValues.utm_medium,attributionValues.utm_campaign,attributionValues.utm_content,attributionValues.utm_term,
    attributionValues.gclid,attributionValues.fbclid,attributionValues.lead_source,attributionValues.platform,attributionValues.campaign_name,
    attributionValues.ad_name,attributionValues.reference_code,attributionValues.attribution_method,conversionAt,raw)];
  const user=currentUser(req);
  operations.push(db.prepare(`INSERT INTO lead_stage_history(id,lead_id,from_stage,to_stage,changed_by,changed_by_name,changed_at)
    VALUES(?,?,'',?,?,?,?)`).bind(crypto.randomUUID(),id,STAGES.includes(p.stage)?p.stage:'novo',user?.id||'',user?.name||'',now));
  if(Object.values(attributionValues).some(Boolean))operations.push(db.prepare(`INSERT INTO lead_attribution_history
    (id,lead_id,changed_by,changed_by_name,old_data,new_data,created_at) VALUES(?,?,?,?,'{}',?,?)`)
    .bind(crypto.randomUUID(),id,user?.id||'',user?.name||'',JSON.stringify(attributionValues),now));
  await db.batch(operations);
  return json({id});
}

export async function PATCH(req:Request){
  if(!canAccess(req,'comercial')||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  if(typeof p.id!=='string')return json({error:'Lead inválido.'},400);
  const db=database(),before=await db.prepare('SELECT * FROM leads WHERE id=?').bind(p.id).first<Record<string,unknown>>();
  if(!before)return json({error:'Lead não encontrado.'},404);
  if(typeof p.reference_code==='string'&&p.reference_code.trim().toLowerCase()!==String(before.reference_code||'').toLowerCase()&&p.reference_code.trim()){
    const reference:any=await db.prepare('SELECT * FROM lead_reference_codes WHERE lower(code)=lower(?) AND active=1').bind(p.reference_code.trim()).first();
    if(!reference)return json({error:`O código "${p.reference_code.trim()}" não existe ou está inativo.`},400);
    p.reference_code=reference.code;p.source='WhatsApp';p.lead_source='whatsapp';p.attribution_method='manual';
    for(const key of ['platform','campaign_name','ad_name','utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid'])p[key]=reference[key]||'';
  }
  const sets:string[]=[],args:any[]=[],changed:Record<string,string>={};
  for(const [k,max] of Object.entries(FIELDS))if(typeof p[k]==='string'){
    if(k==='company'&&p[k].trim().length<2)return json({error:'Informe o nome da empresa.'},400);
    const value=p[k].trim().slice(0,max);
    if(k==='lead_source'&&!CHANNELS.includes(value))return json({error:'Canal de entrada inválido.'},400);
    sets.push(k+'=?');args.push(value);
    if((ATTRIBUTION_FIELDS as readonly string[]).includes(k))changed[k]=value;
  }
  if(p.attribution_method!==undefined){
    if(!METHODS.includes(p.attribution_method))return json({error:'Método de identificação inválido.'},400);
    sets.push('attribution_method=?');args.push(p.attribution_method);changed.attribution_method=p.attribution_method;
  }
  if(p.conversion_at!==undefined){
    const conversionAt=p.conversion_at?Date.parse(String(p.conversion_at)):null;
    if(conversionAt!==null&&!Number.isFinite(conversionAt))return json({error:'Data da conversão inválida.'},400);
    sets.push('conversion_at=?');args.push(conversionAt);changed.conversion_at=conversionAt===null?'':String(conversionAt);
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
  const now=Date.now(),ops=[db.prepare(`UPDATE leads SET ${sets.join(',')},updated_at=? WHERE id=?`).bind(...args,now,p.id)];
  if(Object.keys(changed).length){
    const oldData=Object.fromEntries(Object.keys(changed).map(k=>[k,before[k]??'']));
    ops.push(db.prepare(`INSERT INTO lead_attribution_history(id,lead_id,changed_by,changed_by_name,old_data,new_data,created_at)
      VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),p.id,currentUser(req)?.id||'',currentUser(req)?.name||'',
      JSON.stringify(oldData),JSON.stringify(changed),now));
  }
  if(p.stage!==undefined&&p.stage!==before.stage){
    const user=currentUser(req);
    ops.push(db.prepare(`INSERT INTO lead_stage_history(id,lead_id,from_stage,to_stage,changed_by,changed_by_name,changed_at)
      VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),p.id,String(before.stage||''),p.stage,user?.id||'',user?.name||'',now));
  }
  await db.batch(ops);
  return json({ok:true,by:currentUser(req)?.name});
}
