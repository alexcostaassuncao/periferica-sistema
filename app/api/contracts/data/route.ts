import {database} from '../../../../db/raw';
import {sha256} from '../../../../lib/session';

const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

function page(title:string,body:string,status=200){
  return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escape(title)} · Periférica</title><body style="font:16px system-ui;background:#111827;color:#f3f4f6;margin:0;padding:24px">
    <main style="max-width:760px;margin:32px auto;background:#1f2937;padding:28px;border-radius:16px">
    <h1 style="color:#ff580b">Periférica</h1><h2>${escape(title)}</h2>${body}</main></body></html>`,
    {status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex'}});
}

async function findContract(token:string){
  if(!/^[0-9a-f]{48}$/.test(token))return null;
  const contract=await database().prepare("SELECT id,company,document,contact_name,phone,email,kind,model,data FROM contracts WHERE form_hash=? AND form_expires>? AND status='dados'")
    .bind(await sha256(token),Date.now()).first<{id:string,company:string,document:string,contact_name:string,phone:string,email:string,kind:string,model:string,data:string}>();
  if(!contract)return null;
  return {...contract,data:JSON.parse(contract.data||'{}') as Record<string,unknown>};
}

export async function GET(req:Request){
  const token=new URL(req.url).searchParams.get('t')||'',contract=await findContract(token);
  if(!contract)return page('Link inválido ou expirado','<p>Peça um novo link à equipe da Periférica.</p>',404);
  const fields:[string,string,string][]=[
    ['company','Razão social / nome',String(contract.data.razao_social||contract.company)],['document','CNPJ ou CPF',String(contract.data.documento||contract.document||'')],
    ['contact_name','Responsável legal',String(contract.data.representante||contract.contact_name||'')],['phone','WhatsApp',String(contract.data.telefone||contract.phone||'')],
    ['email','E-mail',String(contract.data.email_socio||contract.email||'')],['address','Endereço',String(contract.data.logradouro||'')],
    ['city','Cidade / UF',String(contract.data.cidade||'')],['postal_code','CEP',String(contract.data.cep||'')],
  ];
  return page('Dados para o contrato',`<p>Preencha os dados abaixo para ${escape(contract.kind)} · ${escape(contract.model)}.</p>
    <form method="post" action="/api/contracts/data" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
    <input type="hidden" name="token" value="${escape(token)}">
    ${fields.map(([name,label,value])=>`<label>${label}<input name="${name}" ${name==='company'?'required':''} value="${escape(value)}" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;border-radius:8px;border:1px solid #4b5563;background:#111827;color:#f3f4f6"></label>`).join('')}
    <button style="grid-column:1/-1;padding:13px;border:0;border-radius:8px;background:#ff580b;color:white;font-weight:700">Enviar dados</button></form>`);
}

export async function POST(req:Request){
  const form=await req.formData(),token=String(form.get('token')||''),contract=await findContract(token);
  if(!contract)return page('Link inválido ou expirado','<p>O link não é válido, já foi utilizado ou expirou. Peça outro à equipe da Periférica.</p>',404);
  const value=(key:string,max:number)=>String(form.get(key)||'').trim().slice(0,max);
  const company=value('company',120),contactName=value('contact_name',120),phone=value('phone',40),email=value('email',200);
  if(company.length<2||(!phone&&!email))return page('Dados incompletos',`<p>Informe o nome do contratante e ao menos um meio de contato.</p><p><a href="/api/contracts/data?t=${escape(token)}" style="color:#ff8b57">Voltar ao formulário</a></p>`,400);
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return page('E-mail inválido',`<p>Revise o endereço de e-mail e envie novamente.</p><p><a href="/api/contracts/data?t=${escape(token)}" style="color:#ff8b57">Voltar ao formulário</a></p>`,400);
  const now=Date.now(),data={...contract.data,razao_social:company,documento:value('document',30),representante:contactName,telefone:phone,email_socio:email,
    logradouro:value('address',300),cidade:value('city',120),cep:value('postal_code',20)};
  const result=await database().prepare(`UPDATE contracts SET company=?,document=?,contact_name=?,phone=?,email=?,data=?,status='elab',
    form_hash=NULL,form_expires=NULL,updated_at=? WHERE id=? AND form_hash=? AND form_expires>? AND status='dados'`)
    .bind(company,data.documento,contactName,phone,email,JSON.stringify(data),now,contract.id,await sha256(token),now).run();
  if(!result.meta.changes)return page('Link inválido ou expirado','<p>O link já foi utilizado ou expirou. Peça outro à equipe da Periférica.</p>',409);
  await database().prepare(`INSERT INTO contract_history(id,contract_id,lead_id,from_status,to_status,action,changed_by_name,created_at)
    VALUES(?,?,?,'dados','elab','dados_recebidos','Cliente',?)`)
    .bind(crypto.randomUUID(),contract.id,(await database().prepare('SELECT lead_id FROM contracts WHERE id=?').bind(contract.id).first<{lead_id:string|null}>())?.lead_id||null,now).run();
  return page('Dados enviados','<p>Obrigado! Os dados foram enviados à equipe da Periférica para elaboração do contrato.</p>');
}
