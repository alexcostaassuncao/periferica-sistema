import {database} from '../../../db/raw';
import {canAccess,currentUser,sameOrigin} from '../../../lib/auth';
import {owners} from '../../../db/crm';

// Contratos: gerados a partir de um lead fechado (ou manualmente), enviados para assinatura e,
// quando assinados, viram cliente automaticamente com os dados do cadastro do lead.
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const denied=()=>json({error:'Você não tem acesso aos Contratos.'},403);
const MODELS:Record<string,string[]>={
  'Gestão':['Gestão completa','Gestão sem social media','Gestão focada em tráfego','Gestão com produção de vídeo'],
  'Projetos':['Website institucional','Website catálogo','E-commerce','Identidade visual','Outros projetos'],
};
const FIELDS:Record<string,number>={company:120,segment:80,contact_name:120,phone:40,email:200,document:30,value:40,term:40};
const canGenerate=(req:Request)=>canAccess(req,'contratos')||canAccess(req,'comercial');

export async function GET(req:Request){
  if(!canAccess(req,'contratos'))return denied();
  const db=database();
  const contracts=(await db.prepare('SELECT * FROM contracts ORDER BY created_at DESC').all()).results;
  // Leads fechados que ainda não têm contrato (para "Novo contrato").
  const closed=(await db.prepare(`SELECT id,company,segment,contact_name FROM leads l WHERE l.stage='fechado' AND l.situation='andamento'
    AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.lead_id=l.id AND c.status<>'canc') ORDER BY l.updated_at DESC`).all()).results;
  return json({contracts,closed,models:MODELS,owners:await owners()});
}

export async function POST(req:Request){
  if(!canGenerate(req)||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  const db=database(),now=Date.now();
  const kind=Object.keys(MODELS).includes(p.kind)?p.kind:null;
  if(!kind||!MODELS[kind].includes(p.model))return json({error:'Escolha o tipo e o modelo do contrato.'},400);
  // Dados do cliente: vêm do cadastro do lead e podem ser ajustados no formulário.
  let base:any={};
  if(p.leadId){
    base=await db.prepare('SELECT * FROM leads WHERE id=?').bind(p.leadId).first();
    if(!base)return json({error:'Lead não encontrado.'},404);
    if(await db.prepare("SELECT id FROM contracts WHERE lead_id=? AND status<>'canc'").bind(p.leadId).first())return json({error:'Este lead já tem um contrato em andamento. Veja na aba Contratos.'},409);
  }
  const v=(k:string)=>String(p[k]??base[k]??'').trim().slice(0,FIELDS[k]);
  const company=v('company');
  if(company.length<2)return json({error:'Informe o nome do cliente.'},400);
  const id=crypto.randomUUID();
  const ops=[db.prepare(`INSERT INTO contracts (id,lead_id,company,segment,contact_name,phone,email,document,kind,model,value,term,owner_id,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'elab',?,?)`).bind(id,p.leadId||null,company,v('segment'),v('contact_name'),v('phone'),v('email'),v('document'),kind,p.model,v('value'),v('term'),
    p.owner_id||base.owner_id||currentUser(req)!.id,now,now)];
  if(p.leadId)ops.push(db.prepare("UPDATE leads SET stage='fechado',updated_at=? WHERE id=?").bind(now,p.leadId));
  try{await db.batch(ops);}catch{return json({error:'Este lead já tem um contrato em andamento.'},409);}
  return json({id});
}

// Ações: edit (ajustar campos), send (enviar para assinatura), sign (assinado → cria o cliente), cancel.
export async function PATCH(req:Request){
  if(!canAccess(req,'contratos')||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  const db=database(),now=Date.now();
  const c:any=await db.prepare('SELECT * FROM contracts WHERE id=?').bind(p.id).first();
  if(!c)return json({error:'Contrato não encontrado.'},404);

  if(p.action==='edit'){
    if(!['elab','aguard'].includes(c.status))return json({error:'Contrato assinado ou cancelado não pode ser editado.'},409);
    const sets:string[]=[],args:any[]=[];
    for(const [k,max] of Object.entries(FIELDS))if(typeof p[k]==='string'){sets.push(k+'=?');args.push(p[k].trim().slice(0,max));}
    if(p.kind&&p.model){if(!MODELS[p.kind]?.includes(p.model))return json({error:'Modelo inválido.'},400);sets.push('kind=?','model=?');args.push(p.kind,p.model);}
    if(!sets.length)return json({error:'Nada para alterar.'},400);
    await db.prepare(`UPDATE contracts SET ${sets.join(',')},updated_at=? WHERE id=?`).bind(...args,now,c.id).run();
    return json({ok:true});
  }
  if(p.action==='send'){
    const r=await db.prepare("UPDATE contracts SET status='aguard',sent_at=?,updated_at=? WHERE id=? AND status='elab'").bind(now,now,c.id).run();
    return r.meta.changes?json({ok:true}):json({error:'Só contratos em elaboração podem ser enviados.'},409);
  }
  if(p.action==='cancel'){
    const reason=String(p.reason||'').trim().slice(0,200);
    if(!reason)return json({error:'Informe o motivo do cancelamento.'},400);
    const r=await db.prepare("UPDATE contracts SET status='canc',cancelled_reason=?,updated_at=? WHERE id=? AND status IN ('elab','aguard')").bind(reason,now,c.id).run();
    return r.meta.changes?json({ok:true}):json({error:'Contrato assinado não pode ser cancelado por aqui (use Financeiro → Cancelamentos).'},409);
  }
  if(p.action==='sign'){
    // Marca como assinado de forma atômica: dois cliques ao mesmo tempo não criam dois clientes.
    const claimed=await db.prepare("UPDATE contracts SET status='assin',signed_at=?,updated_at=? WHERE id=? AND status IN ('elab','aguard') RETURNING *").bind(now,now,c.id).first<any>();
    if(!claimed)return json({error:'Este contrato já foi assinado ou cancelado.'},409);
    const lead:any=claimed.lead_id?await db.prepare('SELECT client_id FROM leads WHERE id=?').bind(claimed.lead_id).first():null;
    let clientId:string=lead?.client_id||'';
    if(clientId&&await db.prepare('SELECT id FROM clients WHERE id=?').bind(clientId).first()){
      // Cliente que volta (ex.: novo contrato depois de um cancelamento): reativa e atualiza os serviços.
      await db.prepare("UPDATE clients SET status='ativo',services=? WHERE id=?").bind(claimed.model,clientId).run();
    }else{
      clientId=crypto.randomUUID();
      await db.prepare(`INSERT INTO clients (id,name,segment,squad,services,status,created_at,contact_name,phone,email,lead_id)
        VALUES (?,?,?,'',?,'ativo',?,?,?,?,?)`).bind(clientId,claimed.company,claimed.segment,claimed.model,new Date(now).toISOString(),claimed.contact_name,claimed.phone,claimed.email,claimed.lead_id).run();
    }
    const ops=[db.prepare('UPDATE contracts SET client_id=? WHERE id=?').bind(clientId,claimed.id)];
    if(claimed.lead_id)ops.push(db.prepare('UPDATE leads SET client_id=?,updated_at=? WHERE id=?').bind(clientId,now,claimed.lead_id));
    await db.batch(ops);
    return json({ok:true,clientId});
  }
  return json({error:'Ação inválida.'},400);
}
