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
  const conditions:string[]=[],args:number[]=[];
  if(fromAt!==null){conditions.push('COALESCE(conversion_at,created_at)>=?');args.push(fromAt+timezoneOffset*60000);}
  if(toAt!==null){conditions.push('COALESCE(conversion_at,created_at)<?');args.push(toAt+timezoneOffset*60000+86400000);}
  const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
  const rows=(await database().prepare(`SELECT
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
  return json({total,byPlatform:aggregate(row=>row.platform),
    byCampaign:aggregate(row=>row.platform+' · '+row.campaign_name),
    byAd:aggregate(row=>row.platform+' · '+row.campaign_name+' · '+row.ad_name),
    byChannel:channel,funnel:[...funnel.values()].sort((a,b)=>a.campaign_name.localeCompare(b.campaign_name,'pt-BR')),
    from,to});
}
