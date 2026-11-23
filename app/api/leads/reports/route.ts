import {database} from '../../../../db/raw';
import {canAccess} from '../../../../lib/auth';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export async function GET(req:Request){
  if(!canAccess(req,'comercial'))return json({error:'Você não tem acesso ao Comercial.'},403);
  const params=new URL(req.url).searchParams,from=params.get('from')||'',to=params.get('to')||'';
  const timezoneOffset=Number(params.get('tz')||0);
  const datePattern=/^\d{4}-\d{2}-\d{2}$/;
  if((from&&!datePattern.test(from))||(to&&!datePattern.test(to))||!Number.isInteger(timezoneOffset)||Math.abs(timezoneOffset)>840)return json({error:'Período inválido.'},400);
  const fromAt=from?Date.parse(from+'T00:00:00Z'):null,toAt=to?Date.parse(to+'T00:00:00Z'):null;
  if((fromAt!==null&&!Number.isFinite(fromAt))||(toAt!==null&&!Number.isFinite(toAt))||(fromAt!==null&&toAt!==null&&fromAt>toAt))return json({error:'Período inválido.'},400);
  const db=database(),common:string[]=[],commonArgs:(string|number)[]=[];
  for(const [key,column,max] of [['source','source',120],['segment','segment',80],['owner','owner_id',120],['stage','stage',40]] as const){
    const value=params.get(key)?.trim().slice(0,max)||'';
    if(value){common.push(`l.${column}=?`);commonArgs.push(value);}
  }
  const product=params.get('product')?.trim().slice(0,120)||'';
  if(product){common.push('EXISTS (SELECT 1 FROM lead_products p WHERE p.lead_id=l.id AND p.name=?)');commonArgs.push(product);}
  const query=params.get('q')?.trim().slice(0,200).toLowerCase()||'';
  if(query){common.push("lower(l.company||' '||l.contact_name||' '||l.email||' '||l.phone) LIKE ?");commonArgs.push('%'+query+'%');}
  const leadRows=(await db.prepare(`SELECT l.id,l.stage,l.created_at,l.proposal_sent_at,l.accepted_at,l.signed_at,l.lost_at
    FROM leads l${common.length?' WHERE '+common.join(' AND '):''}`).bind(...commonArgs).all()).results as any[];
  const leadIds=leadRows.map(row=>String(row.id)),idWhere=leadIds.length?`lead_id IN (${leadIds.map(()=>'?').join(',')})`:'1=0';
  const [productRows,contractRows]=leadIds.length?await Promise.all([
    db.prepare(`SELECT lead_id,name,amount_cents FROM lead_products WHERE ${idWhere}`).bind(...leadIds).all(),
    db.prepare(`SELECT lead_id,amount_cents FROM contracts WHERE ${idWhere} AND status='assin' AND required=1`).bind(...leadIds).all(),
  ]).then(results=>results.map(result=>result.results as any[])):[[],[]];
  const productsByLead=new Map<string,any[]>(),signedValueByLead=new Map<string,number>();
  for(const row of productRows){const list=productsByLead.get(row.lead_id)||[];list.push(row);productsByLead.set(row.lead_id,list);}
  for(const row of contractRows)signedValueByLead.set(row.lead_id,(signedValueByLead.get(row.lead_id)||0)+Number(row.amount_cents||0));
  const inPeriod=(value:unknown)=>{
    const date=Number(value||0);
    return !!date&&(fromAt===null||date>=fromAt+timezoneOffset*60000)&&(toAt===null||date<toAt+timezoneOffset*60000+86400000);
  };
  const stageDate=(row:any)=>row.stage==='proposta'?row.proposal_sent_at||row.created_at:row.stage==='aguardando_contrato'?row.accepted_at||row.created_at:
    row.stage==='fechado'?row.signed_at||row.created_at:row.stage==='venda_perdida'?row.lost_at||row.created_at:row.created_at;
  const ids=(list:any[])=>list.map(row=>String(row.id));
  const leadsReceived=leadRows.filter(row=>inPeriod(row.created_at));
  const negotiation=leadRows.filter(row=>['contato','reuniao'].includes(row.stage)&&inPeriod(row.created_at));
  const proposals=leadRows.filter(row=>inPeriod(row.proposal_sent_at));
  const accepted=leadRows.filter(row=>inPeriod(row.accepted_at));
  const awaitingContracts=leadRows.filter(row=>row.stage==='aguardando_contrato'&&inPeriod(row.accepted_at));
  const lost=leadRows.filter(row=>row.stage==='venda_perdida'&&inPeriod(row.lost_at));
  const closed=leadRows.filter(row=>row.stage==='fechado'&&inPeriod(row.signed_at));
  const cohortClosed=leadsReceived.filter(row=>row.stage==='fechado');
  const proposalValue=(rows:any[])=>rows.reduce((total,row)=>total+(productsByLead.get(row.id)||[]).reduce((sum,item)=>sum+Number(item.amount_cents||0),0),0);
  const byProduct=new Map<string,{name:string,opportunities:Set<string>,amount_cents:number}>();
  for(const row of leadRows.filter(item=>inPeriod(stageDate(item))))for(const item of productsByLead.get(row.id)||[]){
    const group=byProduct.get(item.name)||{name:item.name,opportunities:new Set<string>(),amount_cents:0};
    group.opportunities.add(String(row.id));group.amount_cents+=Number(item.amount_cents||0);byProduct.set(item.name,group);
  }
  const canViewValues=canAccess(req,'comercial')||canAccess(req,'gestao')||canAccess(req,'financeiro');
  const dashboard:any={
    leadsReceived:{count:leadsReceived.length,ids:ids(leadsReceived)},
    negotiation:{count:negotiation.length,ids:ids(negotiation)},
    proposals:{count:proposals.length,ids:ids(proposals)},
    accepted:{count:accepted.length,ids:ids(accepted)},
    awaitingContracts:{count:awaitingContracts.length,ids:ids(awaitingContracts)},
    lost:{count:lost.length,ids:ids(lost)},
    closed:{count:closed.length,ids:ids(closed)},
    conversionRate:leadsReceived.length?cohortClosed.length/leadsReceived.length:0,
    conversionRateIds:ids(leadsReceived),
    byProduct:[...byProduct.values()].map(item=>({name:item.name,opportunities:item.opportunities.size,...(canViewValues?{amount_cents:item.amount_cents}:{})}))
      .sort((a,b)=>b.opportunities-a.opportunities||a.name.localeCompare(b.name,'pt-BR')),
    ...(canViewValues?{
      negotiationValueCents:proposalValue(negotiation),
      proposalValueCents:proposalValue(proposals),
      closedValueCents:closed.reduce((sum,row)=>sum+(signedValueByLead.get(row.id)||0),0),
    }:{}),
    canViewValues,
  };
  const conditions:string[]=[],args:number[]=[];
  if(fromAt!==null){conditions.push('COALESCE(conversion_at,created_at)>=?');args.push(fromAt+timezoneOffset*60000);}
  if(toAt!==null){conditions.push('COALESCE(conversion_at,created_at)<?');args.push(toAt+timezoneOffset*60000+86400000);}
  const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
  const rows=(await db.prepare(`SELECT
    COALESCE(NULLIF(platform,''),'Não identificado') AS platform,
    COALESCE(NULLIF(campaign_name,''),'Sem campanha') AS campaign_name,
    COALESCE(NULLIF(ad_name,''),'Sem anúncio') AS ad_name,
    COALESCE(NULLIF(lead_source,''),'manual') AS lead_source,
    stage,COUNT(*) AS leads,SUM(CASE WHEN client_id IS NOT NULL THEN 1 ELSE 0 END) AS customers
    FROM leads${where} GROUP BY platform,campaign_name,ad_name,lead_source,stage`)
    .bind(...args).all()).results as any[];
  const aggregate=(key:(row:any)=>string)=>{
    const groups=new Map<string,{label:string,leads:number,customers:number}>();
    for(const row of rows){
      const label=key(row),item=groups.get(label)||{label,leads:0,customers:0};
      item.leads+=Number(row.leads);item.customers+=Number(row.customers);groups.set(label,item);
    }
    return [...groups.values()].sort((a,b)=>b.leads-a.leads||a.label.localeCompare(b.label,'pt-BR'));
  };
  const funnel=new Map<string,{platform:string,campaign_name:string,stage:string,leads:number,customers:number}>();
  for(const row of rows){
    const key=row.platform+'|'+row.campaign_name+'|'+row.stage;
    const item=funnel.get(key)||{platform:row.platform,campaign_name:row.campaign_name,stage:row.stage,leads:0,customers:0};
    item.leads+=Number(row.leads);item.customers+=Number(row.customers);funnel.set(key,item);
  }
  const total=rows.reduce((sum,row)=>sum+Number(row.leads),0);
  const channel=aggregate(row=>row.lead_source==='whatsapp_api'?'WhatsApp integrado':
    row.lead_source==='whatsapp'?'WhatsApp manual':row.lead_source==='meta_form'?'Formulário Meta':
    row.lead_source==='form'?'Formulário do site':'Cadastro manual');
  return json({total,dashboard,byPlatform:aggregate(row=>row.platform),
    byCampaign:aggregate(row=>row.platform+' · '+row.campaign_name),
    byAd:aggregate(row=>row.platform+' · '+row.campaign_name+' · '+row.ad_name),
    byChannel:channel,funnel:[...funnel.values()].sort((a,b)=>a.campaign_name.localeCompare(b.campaign_name,'pt-BR')),
    from,to});
}
