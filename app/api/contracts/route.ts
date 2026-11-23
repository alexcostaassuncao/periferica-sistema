import {database} from '../../../db/raw';
import {canAccess,currentUser,sameOrigin} from '../../../lib/auth';
import {owners} from '../../../db/crm';
import {gerarPdf,nomeArquivo} from '../../../lib/contratos/gerar';
import {PLANOS} from '../../../lib/contratos/modelos';
import {mailReady,sendMail} from '../../../lib/mail';
import {sha256} from '../../../lib/session';
import {siteOrigin} from '../../../db/social';
import {logEvent} from '../../../db/clientes';
import {saveFromContractData} from '../../../db/entregas';

// Contratos: gerados a partir de uma oportunidade em Aguardando contrato (ou manualmente), enviados para assinatura e,
// quando assinados, viram cliente automaticamente com os dados do cadastro do lead.
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const denied=()=>json({error:'Você não tem acesso aos Contratos.'},403);
// Gestão = planos (modelo de Gestão de Marketing Digital). Projetos: Website e E-commerce têm modelo pronto.
const MODELS:Record<string,string[]>={
  'Gestão':Object.keys(PLANOS),
  'Projetos':['Website','E-commerce (Tray)','Identidade visual','Outros projetos'],
};
// Dados do formulário completo do contrato (JSON). Limita o tamanho para não guardar lixo.
function cleanData(v:unknown){
  if(!v||typeof v!=='object'||Array.isArray(v))return null;
  const out:Record<string,string|number|boolean>={};
  for(const [k,val] of Object.entries(v as any)){
    if(!/^[a-z_]{2,40}$/.test(k))continue;
    if(typeof val==='number'||typeof val==='boolean')out[k]=val;
    else if(typeof val==='string')out[k]=val.slice(0,6000);
  }
  return JSON.stringify(out).length<60000?out:null;
}
const FIELDS:Record<string,number>={company:120,segment:80,contact_name:120,phone:40,email:200,document:30,value:40,term:40};
const canGenerate=(req:Request)=>canAccess(req,'contratos')||canAccess(req,'comercial');

export async function GET(req:Request){
  if(!canAccess(req,'contratos'))return denied();
  const db=database();
  const contracts=((await db.prepare('SELECT * FROM contracts ORDER BY created_at DESC').all()).results as any[]).map(({share_hash,form_hash,...c})=>({...c,data:JSON.parse(c.data||'{}'),shared:!!share_hash,has_form_link:!!form_hash}));
  // Oportunidades aguardando contrato que ainda não têm contrato ativo.
  const readyLeads=(await db.prepare(`SELECT id,company,segment,contact_name,phone,email,interest FROM leads l
    WHERE l.stage='aguardando_contrato' AND l.situation='andamento'
    AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.lead_id=l.id AND c.status<>'canc') ORDER BY l.updated_at DESC`).all()).results;
  return json({contracts,readyLeads,models:MODELS,owners:await owners()});
}

export async function POST(req:Request){
  if(!canGenerate(req)||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  const db=database(),now=Date.now();
  const kind=Object.keys(MODELS).includes(p.kind)?p.kind:null;
  if(!kind||!MODELS[kind].includes(p.model))return json({error:'Escolha o tipo e o modelo do contrato.'},400);
  const dataRequest=p.dataRequest===true;
  // Dados do cliente: vêm do cadastro do lead e podem ser ajustados no formulário.
  let base:any={};
  if(p.leadId){
    base=await db.prepare('SELECT * FROM leads WHERE id=?').bind(p.leadId).first();
    if(!base)return json({error:'Lead não encontrado.'},404);
    if(base.situation!=='andamento'||base.stage==='venda_perdida')return json({error:'Só oportunidades em andamento podem gerar contrato.'},409);
    if(base.stage==='fechado')return json({error:'Esta oportunidade já foi fechada após a assinatura dos contratos.'},409);
    if(await db.prepare("SELECT id FROM contracts WHERE lead_id=? AND kind=? AND status<>'canc'").bind(p.leadId,kind).first())return json({error:`Já existe um contrato de ${kind} ativo para esta oportunidade.`},409);
  }
  if(dataRequest&&!p.leadId)return json({error:'O formulário externo precisa estar vinculado a uma oportunidade.'},400);
  const v=(k:string)=>String(p[k]??base[k]??'').trim().slice(0,FIELDS[k]);
  const company=v('company');
  if(company.length<2)return json({error:'Informe o nome do cliente.'},400);
  const id=crypto.randomUUID();
  const parsedData=p.data===undefined?{}:cleanData(p.data);
  if(!parsedData)return json({error:'Dados do contrato inválidos.'},400);
  const data=parsedData;
  if(p.leadId&&dataRequest){
    data.razao_social ||= company;
    data.representante ||= v('contact_name');
    data.telefone ||= v('phone');
    data.email_socio ||= v('email');
  }
  if(p.amount_cents!==undefined&&(!Number.isSafeInteger(Number(p.amount_cents))||Number(p.amount_cents)<0||Number(p.amount_cents)>100000000000))
    return json({error:'Valor do contrato inválido.'},400);
  const amountRow=p.leadId?await db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS amount FROM lead_products WHERE lead_id=? AND category=?')
    .bind(p.leadId,kind==='Gestão'?'gestao':'projeto').first<{amount:number}>():null;
  const amountCents=p.amount_cents===undefined?Number(amountRow?.amount||0):Number(p.amount_cents);
  const token=dataRequest?Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join(''):'';
  const formExpires=dataRequest?now+30*86400000:null;
  const status=dataRequest?'dados':'elab';
  const ops: any[]=[];
  if(p.leadId)ops.push(db.prepare("UPDATE contracts SET required=0 WHERE lead_id=? AND kind=? AND status='canc' AND required=1").bind(p.leadId,kind));
  ops.push(db.prepare(`INSERT INTO contracts (id,lead_id,company,segment,contact_name,phone,email,document,kind,model,value,term,owner_id,status,data,amount_cents,required,form_hash,form_expires,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`).bind(id,p.leadId||null,company,v('segment'),v('contact_name'),v('phone'),v('email'),v('document'),kind,p.model,v('value'),v('term'),
    p.owner_id||base.owner_id||currentUser(req)!.id,status,JSON.stringify(data),amountCents,token?await sha256(token):null,formExpires,now,now));
  if(p.leadId&&base.stage!=='fechado'){
    ops.push(db.prepare(`UPDATE leads SET stage='aguardando_contrato',
      accepted_at=CASE WHEN stage='aguardando_contrato' THEN COALESCE(accepted_at,?) ELSE ? END,updated_at=? WHERE id=?`)
      .bind(now,now,now,p.leadId));
    if(base.stage!=='aguardando_contrato'){
      const user=currentUser(req);
      ops.push(db.prepare(`INSERT INTO lead_stage_history(id,lead_id,from_stage,to_stage,changed_by,changed_by_name,changed_at)
        VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),p.leadId,String(base.stage||''),'aguardando_contrato',user?.id||'',user?.name||'',now));
    }
  }
  const user=currentUser(req);
  ops.push(db.prepare(`INSERT INTO contract_history(id,contract_id,lead_id,from_status,to_status,action,changed_by,changed_by_name,created_at)
    VALUES(?,?,?,'',?,?,?,?,?)`).bind(crypto.randomUUID(),id,p.leadId||null,status,dataRequest?'solicitado':'criado',user?.id||'',user?.name||'',now));
  try{await db.batch(ops);}catch{return json({error:'Este lead já tem um contrato em andamento.'},409);}
  return json({id,...(token?{url:`${siteOrigin}/api/contracts/data?t=${token}`}:{})});
}

// Ações: edit (ajustar campos), send (enviar para assinatura), sign (assinado → cria o cliente), cancel.
export async function PATCH(req:Request){
  if(!canAccess(req,'contratos')||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  const db=database(),now=Date.now();
  const c:any=await db.prepare('SELECT * FROM contracts WHERE id=?').bind(p.id).first();
  if(!c)return json({error:'Contrato não encontrado.'},404);

  if(p.action==='edit'){
    if(!['elab','aguard'].includes(c.status))return json({error:'Contrato sem dados, assinado ou cancelado não pode ser editado.'},409);
    const sets:string[]=[],args:any[]=[];
    for(const [k,max] of Object.entries(FIELDS))if(typeof p[k]==='string'){sets.push(k+'=?');args.push(p[k].trim().slice(0,max));}
    if(p.amount_cents!==undefined){
      const amount=Number(p.amount_cents);
      if(!Number.isSafeInteger(amount)||amount<0||amount>100000000000)return json({error:'Valor do contrato inválido.'},400);
      sets.push('amount_cents=?');args.push(amount);
    }
    if(p.kind&&p.model){if(!MODELS[p.kind]?.includes(p.model))return json({error:'Modelo inválido.'},400);sets.push('kind=?','model=?');args.push(p.kind,p.model);}
    if(p.data!==undefined){const d=cleanData(p.data);if(!d)return json({error:'Dados do contrato inválidos.'},400);sets.push('data=?');args.push(JSON.stringify(d));}
    if(!sets.length)return json({error:'Nada para alterar.'},400);
    await db.prepare(`UPDATE contracts SET ${sets.join(',')},updated_at=? WHERE id=?`).bind(...args,now,c.id).run();
    await db.prepare(`INSERT INTO contract_history(id,contract_id,lead_id,from_status,to_status,action,changed_by,changed_by_name,created_at)
      VALUES(?,?,?, ?,?,'editado',?,?,?)`).bind(crypto.randomUUID(),c.id,c.lead_id||null,c.status,c.status,currentUser(req)?.id||'',currentUser(req)?.name||'',now).run();
    return json({ok:true});
  }
  if(p.action==='send'){
    const r=await db.prepare("UPDATE contracts SET status='aguard',sent_at=?,updated_at=? WHERE id=? AND status='elab'").bind(now,now,c.id).run();
    if(!r.meta.changes)return json({error:'Só contratos em elaboração podem ser enviados.'},409);
    await db.prepare(`INSERT INTO contract_history(id,contract_id,lead_id,from_status,to_status,action,changed_by,changed_by_name,created_at)
      VALUES(?,?,?,'elab','aguard','enviado',?,?,?)`).bind(crypto.randomUUID(),c.id,c.lead_id||null,currentUser(req)?.id||'',currentUser(req)?.name||'',now).run();
    return json({ok:true});
  }
  if(p.action==='form-link'){
    if(c.status!=='dados')return json({error:'O link de dados só pode ser renovado enquanto o contrato aguarda dados.'},409);
    const token=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
    await db.prepare('UPDATE contracts SET form_hash=?,form_expires=?,updated_at=? WHERE id=?')
      .bind(await sha256(token),now+30*86400000,now,c.id).run();
    await db.prepare(`INSERT INTO contract_history(id,contract_id,lead_id,from_status,to_status,action,changed_by,changed_by_name,created_at)
      VALUES(?,?,?,'dados','dados','link_reemitido',?,?,?)`).bind(crypto.randomUUID(),c.id,c.lead_id||null,currentUser(req)?.id||'',currentUser(req)?.name||'',now).run();
    return json({url:`${siteOrigin}/api/contracts/data?t=${token}`});
  }
  // Envia o PDF do contrato por email (anexo). Em elaboração → passa para "Aguardando assinatura".
  if(p.action==='email'){
    if(!['elab','aguard'].includes(c.status))return json({error:'Somente contratos elaborados podem ser enviados para assinatura.'},409);
    if(!mailReady())return json({error:'O envio de emails ainda não está configurado na Vercel (SMTP_*).'},503);
    const to=String(p.to||'').trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))return json({error:'Informe um email válido.'},400);
    let pdf:Uint8Array;
    try{pdf=await gerarPdf(c);}catch(e){return json({error:e instanceof Error?e.message:'Não foi possível gerar o PDF.'},400);}
    const me=currentUser(req)!;
    const padrao=`Olá! Tudo bem?\n\nSegue o contrato de parceria com a Periférica Assessoria de Marketing para conferência e assinatura. Qualquer dúvida estou à disposição.\n\nAbraço!\n${me.name}`;
    const ok=await sendMail({to,subject:String(p.subject||'').trim().slice(0,200)||`Contrato – ${c.company} | Periférica`,
      text:String(p.message||'').trim().slice(0,3000)||padrao,replyTo:me.email||undefined,
      attachments:[{filename:nomeArquivo(c),content:pdf,contentType:'application/pdf'}]});
    if(!ok)return json({error:'O email não saiu. Confira a configuração do servidor de email.'},502);
    await db.prepare("UPDATE contracts SET emailed_to=?,emailed_at=?,status=CASE WHEN status='elab' THEN 'aguard' ELSE status END,sent_at=COALESCE(sent_at,?),updated_at=? WHERE id=?").bind(to,now,now,now,c.id).run();
    await db.prepare(`INSERT INTO contract_history(id,contract_id,lead_id,from_status,to_status,action,changed_by,changed_by_name,created_at)
      VALUES(?,?,?,?,?,'email_enviado',?,?,?)`).bind(crypto.randomUUID(),c.id,c.lead_id||null,c.status,'aguard',currentUser(req)?.id||'',currentUser(req)?.name||'',now).run();
    return json({ok:true});
  }
  // Link do PDF para mandar pelo WhatsApp. Vale 30 dias; gerar de novo invalida o anterior.
  if(p.action==='share'){
    if(!['elab','aguard'].includes(c.status))return json({error:'Somente contratos elaborados podem ser enviados para assinatura.'},409);
    try{await gerarPdf(c);}catch(e){return json({error:e instanceof Error?e.message:'Não foi possível gerar o PDF.'},400);}
    const token=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
    await db.prepare("UPDATE contracts SET share_hash=?,share_expires=?,status=CASE WHEN status='elab' THEN 'aguard' ELSE status END,sent_at=COALESCE(sent_at,?),updated_at=? WHERE id=?")
      .bind(await sha256(token),now+30*86400000,now,now,c.id).run();
    await db.prepare(`INSERT INTO contract_history(id,contract_id,lead_id,from_status,to_status,action,changed_by,changed_by_name,created_at)
      VALUES(?,?,?,?,?,'link_enviado',?,?,?)`).bind(crypto.randomUUID(),c.id,c.lead_id||null,c.status,'aguard',currentUser(req)?.id||'',currentUser(req)?.name||'',now).run();
    return json({url:`${siteOrigin}/api/contracts/file?t=${token}`});
  }
  if(p.action==='cancel'){
    const reason=String(p.reason||'').trim().slice(0,200);
    if(!reason)return json({error:'Informe o motivo do cancelamento.'},400);
    const r=await db.prepare("UPDATE contracts SET status='canc',required=0,cancelled_reason=?,form_hash=NULL,form_expires=NULL,updated_at=? WHERE id=? AND status IN ('dados','elab','aguard')").bind(reason,now,c.id).run();
    if(!r.meta.changes)return json({error:'Contrato assinado não pode ser cancelado por aqui (use Financeiro → Cancelamentos).'},409);
    await db.prepare(`INSERT INTO contract_history(id,contract_id,lead_id,from_status,to_status,action,changed_by,changed_by_name,created_at)
      VALUES(?,?,?,?,'canc','cancelado',?,?,?)`).bind(crypto.randomUUID(),c.id,c.lead_id||null,c.status,currentUser(req)?.id||'',currentUser(req)?.name||'',now).run();
    return json({ok:true});
  }
  if(p.action==='sign'){
    if(c.status!=='aguard')return json({error:'Só contratos aguardando assinatura podem ser confirmados.'},409);
    if(c.lead_id&&await db.prepare("SELECT id FROM leads WHERE id=? AND stage='venda_perdida'").bind(c.lead_id).first())
      return json({error:'A oportunidade está registrada como venda perdida e não pode ser assinada.'},409);
    // Marca como assinado de forma atômica: dois cliques ao mesmo tempo não criam dois clientes.
    const claimed=await db.prepare("UPDATE contracts SET status='assin',signed_at=?,updated_at=? WHERE id=? AND status='aguard' RETURNING *").bind(now,now,c.id).first<any>();
    if(!claimed)return json({error:'Este contrato já foi assinado ou cancelado.'},409);
    const lead:any=claimed.lead_id?await db.prepare('SELECT client_id,stage FROM leads WHERE id=?').bind(claimed.lead_id).first():null;
    let clientId:string=claimed.lead_id
      ?String((await db.prepare('SELECT id FROM clients WHERE lead_id=? ORDER BY created_at LIMIT 1').bind(claimed.lead_id).first<{id:string}>())?.id||lead?.client_id||'')
      :String(lead?.client_id||'');
    if(clientId&&await db.prepare('SELECT id FROM clients WHERE id=?').bind(clientId).first()){
      // Cliente que volta (ex.: novo contrato depois de um cancelamento): reativa e atualiza os serviços.
      await db.prepare("UPDATE clients SET status='ativo',services=? WHERE id=?").bind(claimed.model,clientId).run();
    }else{
      clientId=crypto.randomUUID();
      if(claimed.lead_id){
        await db.prepare(`INSERT INTO clients (id,name,segment,squad,services,status,created_at,contact_name,phone,email,lead_id)
          SELECT ?,?,?, '',?,'ativo',?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM clients WHERE lead_id=?)`)
          .bind(clientId,claimed.company,claimed.segment,claimed.model,new Date(now).toISOString(),claimed.contact_name,claimed.phone,claimed.email,claimed.lead_id,claimed.lead_id).run();
        const linked=await db.prepare('SELECT id FROM clients WHERE lead_id=? ORDER BY created_at LIMIT 1').bind(claimed.lead_id).first<{id:string}>();
        if(!linked)return json({error:'Não foi possível vincular o cliente à oportunidade.'},500);
        clientId=linked.id;
        await db.prepare("UPDATE clients SET status='ativo',services=? WHERE id=?").bind(claimed.model,clientId).run();
      }else{
        await db.prepare(`INSERT INTO clients (id,name,segment,squad,services,status,created_at,contact_name,phone,email,lead_id)
          VALUES (?,?,?,'',?,'ativo',?,?,?,?,?)`).bind(clientId,claimed.company,claimed.segment,claimed.model,new Date(now).toISOString(),claimed.contact_name,claimed.phone,claimed.email,null).run();
      }
    }
    let opportunityClosed=false;
    if(claimed.lead_id){
      const totals=await db.prepare(`SELECT COUNT(*) AS required_count,
        SUM(CASE WHEN status='assin' THEN 1 ELSE 0 END) AS signed_count
        FROM contracts WHERE lead_id=? AND required=1`).bind(claimed.lead_id).first<{required_count:number,signed_count:number}>();
      opportunityClosed=Number(totals?.required_count||0)>0&&Number(totals?.required_count)===Number(totals?.signed_count||0);
    }
    const ops=[db.prepare('UPDATE contracts SET client_id=? WHERE id=?').bind(clientId,claimed.id),
      db.prepare(`INSERT INTO contract_history(id,contract_id,lead_id,from_status,to_status,action,changed_by,changed_by_name,created_at)
        VALUES(?,?,?,'aguard','assin','assinado',?,?,?)`).bind(crypto.randomUUID(),claimed.id,claimed.lead_id||null,currentUser(req)?.id||'',currentUser(req)?.name||'',now)];
    if(claimed.lead_id){
      const nextStage=opportunityClosed?'fechado':lead?.stage==='venda_perdida'?'venda_perdida':'aguardando_contrato';
      ops.push(db.prepare(`UPDATE leads SET client_id=?,stage=?,signed_at=?,updated_at=? WHERE id=?`)
        .bind(clientId,nextStage,opportunityClosed?now:null,now,claimed.lead_id));
      if(lead&&lead.stage!==nextStage){
        const user=currentUser(req);
        ops.push(db.prepare(`INSERT INTO lead_stage_history(id,lead_id,from_stage,to_stage,changed_by,changed_by_name,changed_at)
          VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),claimed.lead_id,String(lead.stage||''),nextStage,user?.id||'',user?.name||'',now));
      }
    }
    await db.batch(ops);
    // Entregas do plano preenchidas no contrato viram o "o que o plano inclui" do cliente.
    let cdata:any={};try{cdata=JSON.parse(claimed.data||'{}');}catch{}
    try{await saveFromContractData(clientId,cdata,currentUser(req)?.name||'');}catch{}
    // O serviço entra sozinho na fila de onboarding da área (Gestão ou Projetos); o gerente assume e define os responsáveis.
    const line=claimed.kind==='Projetos'?'projetos':'gestao';
    await db.prepare(`INSERT INTO client_services (id,client_id,contract_id,line,name,status,created_at,updated_at) VALUES (?,?,?,?,?,'aguardando',?,?)
      ON CONFLICT(contract_id) DO NOTHING`).bind(crypto.randomUUID(),clientId,claimed.id,line,claimed.model,now,now).run();
    if(line==='gestao'){
      const start=/^\d{4}-\d{2}-\d{2}$/.test(cdata.inicio||'')?cdata.inicio:new Date(now).toISOString().slice(0,10);
      await db.prepare("UPDATE clients SET service_start=?,service_end='' WHERE id=? AND (service_start='' OR service_end<>'')").bind(start,clientId).run();
    }
    await logEvent(clientId,'sistema',`Contrato assinado: ${claimed.kind} – ${claimed.model}`,claimed.value?`Valor: ${claimed.value}`:'',currentUser(req));
    return json({ok:true,clientId,opportunityClosed});
  }
  return json({error:'Ação inválida.'},400);
}
