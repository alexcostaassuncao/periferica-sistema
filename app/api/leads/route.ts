import {database} from '../../../db/raw';
import {canAccess,currentUser,sameOrigin} from '../../../lib/auth';
import {PRODUCT_CATEGORIES,STAGES,owners} from '../../../db/crm';
import {PRODUCT_CATALOG,normalizeProductInterest,resolveProductInterests} from '../../../db/produtos';

// CRM comercial: leads, etapas do funil, espera e arquivados.
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const denied=()=>json({error:'Você não tem acesso ao Comercial.'},403);
const SITUATIONS=['andamento','espera','arquivado'];
const INITIAL_STAGES=['novo','contato','reuniao','proposta'];
const FIELDS:Record<string,number>={company:120,segment:80,source:60,contact_name:120,phone:40,email:200,interest:120,notes:4000,reason:200,loss_reason:1000,return_at:20,
  utm_source:120,utm_medium:120,utm_campaign:120,utm_content:120,utm_term:120,gclid:300,fbclid:300,lead_source:30,platform:60,
  campaign_name:120,ad_name:120,reference_code:40};
const ATTRIBUTION_FIELDS=['source','utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','lead_source',
  'platform','campaign_name','ad_name','reference_code','attribution_method','conversion_at'] as const;
const METHODS=['automatic','integration','manual'];
const CHANNELS=['manual','form','whatsapp','meta_form','whatsapp_api','integration'];
const canViewAmounts=(req:Request)=>canAccess(req,'comercial')||canAccess(req,'gestao')||canAccess(req,'financeiro');

function normalizeProducts(value:unknown){
  if(!Array.isArray(value)||value.length>20)return null;
  const products=new Map<string,{category:string,name:string,amount_cents:number}>();
  for(const item of value){
    if(typeof item!=='string'&&(!item||typeof item!=='object'))return null;
    const rawName=typeof item==='string'?item:String((item as any).name||'');
    const name=rawName.trim().slice(0,120);
    const rawCategory=typeof item==='string'?undefined:(item as any).category;
    if(rawCategory!==undefined&&!PRODUCT_CATEGORIES.includes(String(rawCategory) as any))return null;
    const service=normalizeProductInterest(name,rawCategory===undefined?undefined:String(rawCategory));
    const amount=typeof item==='string'?0:Number((item as any).amount_cents??0);
    if(!service||!Number.isSafeInteger(amount)||amount<0||amount>100000000000)return null;
    const existing=products.get(service.name),total=(existing?.amount_cents||0)+amount;
    if(total>100000000000)return null;
    products.set(service.name,{...service,amount_cents:total});
  }
  return [...products.values()];
}

const productSnapshot=(products:any[])=>products.map(({category,name,amount_cents})=>({category,name,amount_cents:Number(amount_cents)||0}));

export async function GET(req:Request){
  if(!canAccess(req,'comercial'))return denied();
  const db=database();
  const leads=(await db.prepare('SELECT * FROM leads ORDER BY updated_at DESC').all()).results as any[];
  const ids=leads.map(lead=>lead.id),canViewValues=canViewAmounts(req);
  if(!ids.length)return json({leads:[],owners:await owners(),canViewValues,catalog:PRODUCT_CATALOG});
  const placeholders=ids.map(()=>'?').join(',');
  const products=(await db.prepare(`SELECT id,lead_id,category,name,amount_cents,position FROM lead_products
    WHERE lead_id IN (${placeholders}) ORDER BY position,created_at`).bind(...ids).all()).results as any[];
  const contracts=(await db.prepare(`SELECT id,lead_id,kind,model,status,required,amount_cents,created_at,sent_at,signed_at,cancelled_reason
    FROM contracts WHERE lead_id IN (${placeholders}) ORDER BY created_at DESC`).bind(...ids).all()).results as any[];
  const productsByLead=new Map<string,any[]>(),contractsByLead=new Map<string,any[]>();
  for(const product of products){
    const list=productsByLead.get(product.lead_id)||[];
    list.push(canViewValues?product:(()=>{const {amount_cents,...rest}=product;return rest;})());
    productsByLead.set(product.lead_id,list);
  }
  for(const contract of contracts){
    const list=contractsByLead.get(contract.lead_id)||[];
    if(!canViewValues){const {amount_cents,...rest}=contract;list.push(rest);}else list.push(contract);
    contractsByLead.set(contract.lead_id,list);
  }
  return json({leads:leads.map(lead=>({...lead,products:productsByLead.get(lead.id)||[],
    contracts:contractsByLead.get(lead.id)||[],contract_status:(contractsByLead.get(lead.id)||[]).find(c=>c.status!=='canc')?.status||null})),
    owners:await owners(),canViewValues,catalog:PRODUCT_CATALOG});
}

export async function POST(req:Request){
  if(!canAccess(req,'comercial')||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  const company=String(p.company||'').trim().slice(0,120);
  if(company.length<2)return json({error:'Informe o nome da empresa.'},400);
  if(p.stage!==undefined&&!INITIAL_STAGES.includes(p.stage))return json({error:'A etapa inicial do lead é inválida.'},400);
  const id=crypto.randomUUID(),now=Date.now();
  const conversionAt=p.conversion_at?Date.parse(String(p.conversion_at)):now;
  if(!Number.isFinite(conversionAt))return json({error:'Data da conversão inválida.'},400);
  if(p.attribution_method!==undefined&&!METHODS.includes(p.attribution_method))return json({error:'Método de identificação inválido.'},400);
  if(p.lead_source!==undefined&&!CHANNELS.includes(p.lead_source))return json({error:'Canal de entrada inválido.'},400);
  const rawInterest=p.interest??p.interests??'';
  const interestText=Array.isArray(rawInterest)?rawInterest.map((value:any)=>typeof value==='string'?value:String(value?.name||'')).filter(Boolean).join(', '):String(rawInterest||'');
  const v=(k:string)=>String(k==='interest'?interestText:p[k]||'').trim().slice(0,FIELDS[k]);
  if(p.products!==undefined&&!Array.isArray(p.products))return json({error:'A lista de produtos é inválida.'},400);
  const selectedProducts=p.products===undefined?[]:normalizeProducts(p.products.map((item:any)=>typeof item==='string'?item:{...item,amount_cents:0}));
  if(p.products!==undefined&&!selectedProducts)return json({error:'Revise os produtos ou serviços selecionados.'},400);
  const interestInputs=p.interests!==undefined
    ?[p.interests].flat()
    :selectedProducts?.length?[]:[rawInterest].flat();
  const inferredProducts=resolveProductInterests([...interestInputs,
    ...(String(p.other_service||'').trim()?['Outros serviços']:[])]);
  const initialProducts=normalizeProducts([...(selectedProducts||[]),...inferredProducts]);
  if(!initialProducts)return json({error:'Revise os produtos ou serviços selecionados.'},400);
  const interestValue=[v('interest')||initialProducts.map(product=>product.name).join(', '),String(p.other_service||'').trim()]
    .filter(Boolean).join(': ').slice(0,FIELDS.interest);
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
    v('contact_name'),v('phone'),v('email'),interestValue,v('notes'),INITIAL_STAGES.includes(p.stage)?p.stage:'novo',p.owner_id||null,now,now,
    attributionValues.utm_source,attributionValues.utm_medium,attributionValues.utm_campaign,attributionValues.utm_content,attributionValues.utm_term,
    attributionValues.gclid,attributionValues.fbclid,attributionValues.lead_source,attributionValues.platform,attributionValues.campaign_name,
    attributionValues.ad_name,attributionValues.reference_code,attributionValues.attribution_method,conversionAt,raw)];
  // Produtos selecionados ou reconhecidos pelo texto de interesse usam o mesmo catálogo.
  initialProducts.forEach((product,position)=>operations.push(db.prepare(`INSERT INTO lead_products(id,lead_id,category,name,amount_cents,position,created_at,updated_at)
      VALUES(?,?,?,?,0,?,?,?)`).bind(crypto.randomUUID(),id,product.category,product.name,position,now,now)));
  const user=currentUser(req);
  operations.push(db.prepare(`INSERT INTO lead_stage_history(id,lead_id,from_stage,to_stage,changed_by,changed_by_name,changed_at)
    VALUES(?,?,'',?,?,?,?)`).bind(crypto.randomUUID(),id,INITIAL_STAGES.includes(p.stage)?p.stage:'novo',user?.id||'',user?.name||'',now));
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
  let newProducts:any[]|null=null,oldProducts:any[]=[],contractsToCancel:any[]=[];
  if(p.products!==undefined||p.stage==='proposta'||before.stage==='proposta'){
    oldProducts=(await db.prepare('SELECT category,name,amount_cents FROM lead_products WHERE lead_id=? ORDER BY position,created_at').bind(p.id).all()).results as any[];
  }
  for(const [k,max] of Object.entries(FIELDS))if(k!=='loss_reason'&&typeof p[k]==='string'){
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
  if(p.stage!==undefined){
    if(!STAGES.includes(p.stage))return json({error:'Etapa inválida.'},400);
    if(p.stage==='fechado'&&before.stage!=='fechado')return json({error:'Só a confirmação da assinatura do contrato pode fechar uma oportunidade.'},409);
    if(before.stage==='fechado'&&p.stage!=='fechado')return json({error:'Uma oportunidade com contrato assinado não pode sair de Fechado.'},409);
    if(p.stage==='aguardando_contrato'&&before.stage!=='aguardando_contrato')return json({error:'Use Gerar contrato para mover a oportunidade para Aguardando contrato.'},409);
    if(p.stage==='venda_perdida'&&before.stage!=='venda_perdida'){
      if(await db.prepare("SELECT id FROM contracts WHERE lead_id=? AND status='assin' LIMIT 1").bind(p.id).first())
        return json({error:'A oportunidade não pode ser perdida porque já há um contrato assinado.'},409);
      contractsToCancel=(await db.prepare("SELECT id,status FROM contracts WHERE lead_id=? AND status IN ('dados','elab','aguard')").bind(p.id).all()).results as any[];
    }
    if(p.stage!==before.stage){sets.push('stage=?');args.push(p.stage);}
  }
  if(p.products!==undefined){
    if(!canViewAmounts(req))return json({error:'Você não tem permissão para alterar valores de produtos.'},403);
    newProducts=normalizeProducts(p.products);
    if(!newProducts)return json({error:'Revise os produtos e valores informados.'},400);
    const oldSnapshot=productSnapshot(oldProducts),newSnapshot=productSnapshot(newProducts);
    if(JSON.stringify(oldSnapshot)===JSON.stringify(newSnapshot))newProducts=null;
  }
  const resultingProducts=newProducts||oldProducts;
  if((p.stage==='proposta'||before.stage==='proposta')&&!resultingProducts.length)return json({error:'Inclua ao menos um produto ou serviço na proposta.'},400);
  if(p.loss_reason!==undefined){
    if(p.stage!=='venda_perdida'&&before.stage!=='venda_perdida')return json({error:'O motivo de perda só pode ser registrado em Venda perdida.'},400);
    if(typeof p.loss_reason!=='string')return json({error:'Informe um motivo válido para a venda perdida.'},400);
    const lossReason=p.loss_reason.trim().slice(0,FIELDS.loss_reason);
    if((p.stage==='venda_perdida'||before.stage==='venda_perdida')&&!lossReason)return json({error:'Informe o motivo da venda perdida.'},400);
    if(lossReason!==String(before.loss_reason||'')){sets.push('loss_reason=?');args.push(lossReason);}
  }
  const lossReason=String(p.loss_reason??before.loss_reason??'').trim().slice(0,FIELDS.loss_reason);
  if(p.stage==='venda_perdida'&&!lossReason)return json({error:'Informe o motivo da venda perdida.'},400);
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
  const now=Date.now();
  if(p.stage==='proposta'&&before.stage!=='proposta'||newProducts&&(p.stage==='proposta'||before.stage==='proposta')){sets.push('proposal_sent_at=?');args.push(now);}
  if(p.stage==='venda_perdida'&&before.stage!=='venda_perdida'){sets.push('lost_at=?');args.push(now);}
  if(p.stage==='venda_perdida'&&before.stage==='venda_perdida'&&typeof p.loss_reason==='string'&&p.loss_reason.trim()!==String(before.loss_reason||'')){sets.push('lost_at=?');args.push(now);}
  if(!sets.length&&!newProducts)return json({error:'Nada para alterar.'},400);
  const ops=[db.prepare(`UPDATE leads SET ${[...sets,"updated_at=?"].join(",")} WHERE id=?`).bind(...args,now,p.id)];
  for(const contract of contractsToCancel){
    ops.push(db.prepare("UPDATE contracts SET status='canc',required=0,cancelled_reason=?,form_hash=NULL,form_expires=NULL,updated_at=? WHERE id=? AND status IN ('dados','elab','aguard')")
      .bind(`Oportunidade perdida: ${lossReason}`,now,contract.id));
    ops.push(db.prepare(`INSERT INTO contract_history(id,contract_id,lead_id,from_status,to_status,action,changed_by,changed_by_name,created_at)
      VALUES(?,?,?,?,'canc','oportunidade_perdida',?,?,?)`).bind(crypto.randomUUID(),contract.id,p.id,contract.status,
        currentUser(req)?.id||'',currentUser(req)?.name||'',now));
  }
  if(newProducts){
    ops.push(db.prepare('DELETE FROM lead_products WHERE lead_id=?').bind(p.id));
    newProducts.forEach((product,position)=>ops.push(db.prepare(`INSERT INTO lead_products
      (id,lead_id,category,name,amount_cents,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),p.id,product.category,product.name,product.amount_cents,position,now,now)));
    const user=currentUser(req);
    ops.push(db.prepare(`INSERT INTO lead_product_history(id,lead_id,changed_by,changed_by_name,old_data,new_data,created_at)
      VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),p.id,user?.id||'',user?.name||'',
      JSON.stringify(productSnapshot(oldProducts)),JSON.stringify(productSnapshot(newProducts)),now));
  }
  if(Object.keys(changed).length){
    const oldData=Object.fromEntries(Object.keys(changed).map(k=>[k,before[k]??'']));
    ops.push(db.prepare(`INSERT INTO lead_attribution_history(id,lead_id,changed_by,changed_by_name,old_data,new_data,created_at)
      VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),p.id,currentUser(req)?.id||'',currentUser(req)?.name||'',
      JSON.stringify(oldData),JSON.stringify(changed),now));
  }
  const stageChanged=p.stage!==undefined&&p.stage!==before.stage;
  const lossReasonChanged=p.loss_reason!==undefined&&String(p.loss_reason||'').trim().slice(0,FIELDS.loss_reason)!==String(before.loss_reason||'');
  if(stageChanged||lossReasonChanged){
    const user=currentUser(req);
    const historyReason=p.stage==='venda_perdida'||before.stage==='venda_perdida'?lossReason:'';
    ops.push(db.prepare(`INSERT INTO lead_stage_history(id,lead_id,from_stage,to_stage,reason,changed_by,changed_by_name,changed_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),p.id,String(before.stage||''),String(p.stage??before.stage),
      historyReason,user?.id||'',user?.name||'',now));
  }
  await db.batch(ops);
  return json({ok:true,by:currentUser(req)?.name});
}
