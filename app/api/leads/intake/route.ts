import {database} from '../../../../db/raw';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const ATTRIBUTION_KEYS=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid'] as const;

function text(value:unknown,max=500){return String(value??'').trim().slice(0,max);}

function validOrigin(req:Request){
  const origin=req.headers.get('origin'),host=req.headers.get('x-forwarded-host')||req.headers.get('host');
  if(!origin||!host)return false;
  try{return new URL(origin).host.toLowerCase()===host.split(',')[0].trim().toLowerCase();}
  catch{return false;}
}

function readAttribution(req:Request){
  const raw=req.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith('pf-lead-attribution='))
    ?.slice('pf-lead-attribution='.length);
  if(!raw)return {};
  try{
    const parsed=JSON.parse(decodeURIComponent(raw));
    return Object.fromEntries(ATTRIBUTION_KEYS.map(key=>[key,text(parsed[key])]));
  }catch{return {};}
}

async function requestKey(req:Request){
  const ip=req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')?.split(',').pop()?.trim()||'unknown';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function POST(req:Request){
  if(!validOrigin(req))return json({error:'Origem da solicitação inválida.'},403);
  const p:any=await req.json().catch(()=>null);
  if(!p||typeof p!=='object')return json({error:'Dados do formulário inválidos.'},400);
  if(text(p.website,200))return json({error:'Não foi possível enviar o formulário.'},400);
  const company=text(p.company,120),contact=text(p.contact_name,120),phone=text(p.phone,40),email=text(p.email,200);
  if(company.length<2||(!phone&&!email))return json({error:'Informe a empresa e ao menos um meio de contato.'},400);
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:'Informe um email válido.'},400);

  const now=Date.now(),windowStart=now-60*60*1000,key=await requestKey(req),db=database();
  await db.prepare(`INSERT INTO lead_intake_limits(ip_hash,window_start,count) VALUES(?,?,1)
    ON CONFLICT(ip_hash) DO UPDATE SET
      count=CASE WHEN lead_intake_limits.window_start<=? THEN 1 ELSE lead_intake_limits.count+1 END,
      window_start=CASE WHEN lead_intake_limits.window_start<=? THEN excluded.window_start ELSE lead_intake_limits.window_start END`)
    .bind(key,now,windowStart,windowStart).run();
  const limit=await db.prepare('SELECT count FROM lead_intake_limits WHERE ip_hash=?').bind(key).first<{count:number}>();
  if((limit?.count||0)>8)return json({error:'Limite de envios atingido. Tente novamente mais tarde.'},429);

  const attribution=readAttribution(req);
  const id=crypto.randomUUID();
  const attributionValues={source:'Site',lead_source:'form',platform:attribution.utm_source||'',
    campaign_name:attribution.utm_campaign||'',ad_name:attribution.utm_content||'',attribution_method:'automatic',
    conversion_at:String(now),...attribution};
  await db.batch([db.prepare(`INSERT INTO leads(
    id,company,segment,source,contact_name,phone,email,interest,notes,stage,situation,
    created_at,updated_at,lead_source,platform,campaign_name,ad_name,attribution_method,
    conversion_at,attribution_raw,utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,fbclid
  ) VALUES(?,?,?,'Site',?,?,?,?,'','novo','andamento',?,?, 'form',?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,company,text(p.segment,80),contact,phone,email,text(p.interest,120),now,now,
      attribution.utm_source||'',attribution.utm_campaign||'',attribution.utm_content||'',
      'automatic',now,JSON.stringify(attribution),
      attribution.utm_source||'',attribution.utm_medium||'',attribution.utm_campaign||'',
      attribution.utm_content||'',attribution.utm_term||'',attribution.gclid||'',attribution.fbclid||''),
    db.prepare(`INSERT INTO lead_stage_history(id,lead_id,from_stage,to_stage,changed_by,changed_by_name,changed_at)
      VALUES(?,?,'','novo','form','Formulário do site',?)`).bind(crypto.randomUUID(),id,now),
    db.prepare(`INSERT INTO lead_attribution_history(id,lead_id,changed_by,changed_by_name,old_data,new_data,created_at)
      VALUES(?,?,'form','Formulário do site','{}',?,?)`).bind(crypto.randomUUID(),id,JSON.stringify(attributionValues),now)]);
  return json({ok:true});
}
