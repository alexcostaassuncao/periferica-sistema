import {database} from '../../../../db/raw';
import {sha256} from '../../../../lib/session';

/* Formulário externo (sem login) para o cliente enviar os dados do contrato.
   Pessoa física: nome, CPF, data de nascimento, WhatsApp, endereço e e-mail.
   Pessoa jurídica: razão social, CNPJ, responsável legal (nome, CPF, nascimento, e-mail), endereço da empresa e e-mail financeiro.
   Os campos usam as mesmas chaves do contrato (razao_social, documento, representante...), então já entram no PDF. */

const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const digits=(v:string)=>v.replace(/\D/g,'');

function validCpf(v:string){
  const d=digits(v);if(d.length!==11||/^(\d)\1+$/.test(d))return false;
  const dv=(n:number)=>{let s=0;for(let i=0;i<n;i++)s+=+d[i]*(n+1-i);const r=(s*10)%11;return r===10?0:r;};
  return dv(9)===+d[9]&&dv(10)===+d[10];
}
function validCnpj(v:string){
  const d=digits(v);if(d.length!==14||/^(\d)\1+$/.test(d))return false;
  const dv=(n:number)=>{const w=n===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];let s=0;for(let i=0;i<n;i++)s+=+d[i]*w[i];const r=s%11;return r<2?0:11-r;};
  return dv(12)===+d[12]&&dv(13)===+d[13];
}
const fmtCpf=(v:string)=>digits(v).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4');
const fmtCnpj=(v:string)=>digits(v).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
const fmtCep=(v:string)=>digits(v).replace(/^(\d{5})(\d{3})$/,'$1-$2');
const validEmail=(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function validBirth(v:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const d=new Date(v+'T12:00:00');if(isNaN(d.getTime()))return false;
  const age=(Date.now()-d.getTime())/(365.25*86400000);
  return age>=16&&age<=120;
}

const CSS=`*{box-sizing:border-box}body{font:16px system-ui,sans-serif;background:#111827;color:#f3f4f6;margin:0;padding:16px}
main{max-width:780px;margin:24px auto;background:#1f2937;padding:28px;border-radius:16px}h1{color:#ff580b;margin:0 0 6px}h2{margin:18px 0 6px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.full{grid-column:1/-1}
label{display:block;font-size:14px}input{display:block;width:100%;margin-top:6px;padding:11px;border-radius:8px;border:1px solid #4b5563;background:#111827;color:#f3f4f6;font:inherit}
input[aria-invalid=true]{border-color:#f87171}.err{color:#fca5a5;font-size:12.5px;margin-top:4px;display:block}
fieldset{border:1px solid #374151;border-radius:12px;padding:16px;margin:16px 0 0}legend{padding:0 6px;color:#ff8b57;font-weight:700}
.tipo{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.tipo label{border:1px solid #4b5563;border-radius:10px;padding:14px;cursor:pointer;display:flex;gap:10px;align-items:center}
.tipo input{width:auto;margin:0;accent-color:#ff580b}.tipo label:has(input:checked){border-color:#ff580b;background:#ff580b1a}
.alert{background:#7f1d1d55;border:1px solid #f8717180;border-radius:10px;padding:10px 14px;margin-top:14px;font-size:14px}
button{width:100%;margin-top:18px;padding:14px;border:0;border-radius:8px;background:#ff580b;color:#fff;font:inherit;font-weight:700;cursor:pointer}
small.hint{color:#9ca3af;font-size:12.5px}@media(max-width:520px){main{padding:18px}.tipo{grid-template-columns:1fr}}`;

function page(title:string,body:string,status=200){
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex"><title>${escape(title)} · Periférica</title><style>${CSS}</style></head><body>
    <main><h1>Periférica</h1><h2>${escape(title)}</h2>${body}</main></body></html>`,
    {status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex'}});
}

type Contract={id:string,company:string,document:string,contact_name:string,phone:string,email:string,kind:string,model:string,data:Record<string,any>};
async function findContract(token:string):Promise<Contract|null>{
  if(!/^[0-9a-f]{48}$/.test(token))return null;
  const c=await database().prepare("SELECT id,company,document,contact_name,phone,email,kind,model,data FROM contracts WHERE form_hash=? AND form_expires>? AND status='dados'")
    .bind(await sha256(token),Date.now()).first<any>();
  if(!c)return null;
  let data={};try{data=JSON.parse(c.data||'{}');}catch{}
  return {...c,data};
}

// Valores iniciais do formulário a partir do que a equipe já tem (cadastro do lead / contrato).
function initial(c:Contract){
  const d=c.data,doc=String(d.documento||c.document||'');
  const tipo=d.tipo_pessoa==='pf'||d.tipo_pessoa==='pj'?d.tipo_pessoa:digits(doc).length===11?'pf':'pj';
  const base={logradouro:d.logradouro,numero:d.numero,complemento:d.complemento,bairro:d.bairro,cidade:d.cidade,cep:d.cep,nascimento:d.nascimento,telefone:d.telefone||c.phone};
  return {tipo,
    pf_nome:tipo==='pf'?d.razao_social||c.company:d.representante||c.contact_name,pf_cpf:tipo==='pf'?doc:d.cpf_representante,pf_email:d.email_socio||c.email,
    pj_razao:tipo==='pj'?d.razao_social||c.company:'',pj_cnpj:tipo==='pj'?doc:'',pj_rep:d.representante||c.contact_name,pj_cpf:d.cpf_representante,
    pj_email:d.email_socio||c.email,pj_fin:d.email_financeiro,...base} as Record<string,any>;
}

function form(token:string,c:Contract,v:Record<string,any>,errors:Record<string,string>={}){
  const f=(name:string,label:string,{type='text',req=true,full=false,ph='',hint=''}={})=>`<label class="${full?'full':''}">${label}${req?'':' <small class="hint">(opcional)</small>'}
    <input name="${name}" type="${type}" value="${escape(v[name]||'')}" ${req?'data-req':''} ${ph?`placeholder="${escape(ph)}"`:''} ${errors[name]?'aria-invalid="true"':''}>
    ${errors[name]?`<span class="err">${escape(errors[name])}</span>`:hint?`<small class="hint">${hint}</small>`:''}</label>`;
  const addr=(title:string)=>`<fieldset><legend data-addr>${title}</legend><div class="grid">
    ${f('logradouro','Rua / Avenida',{full:true})}${f('numero','Número')}${f('complemento','Complemento',{req:false,ph:'sala, apto…'})}
    ${f('bairro','Bairro')}${f('cidade','Cidade / UF',{ph:'Criciúma/SC'})}${f('cep','CEP',{ph:'00000-000'})}</div></fieldset>`;
  const pf=v.tipo==='pf',n=Object.keys(errors).length;
  return page('Dados para o contrato',`<p>Preencha os dados abaixo para ${escape(c.kind)} · ${escape(c.model)}.</p>
    ${n?`<div class="alert">Revise ${n===1?'o campo marcado':`os ${n} campos marcados`} abaixo.</div>`:''}
    <form method="post" action="/api/contracts/data" novalidate>
    <input type="hidden" name="token" value="${escape(token)}">
    <div class="tipo"><label><input type="radio" name="tipo" value="pf" ${pf?'checked':''}><span><b>Pessoa física</b><br><small class="hint">Contrato no seu nome (CPF)</small></span></label>
      <label><input type="radio" name="tipo" value="pj" ${pf?'':'checked'}><span><b>Pessoa jurídica</b><br><small class="hint">Contrato da empresa (CNPJ)</small></span></label></div>
    <div data-sec="pf" ${pf?'':'hidden'}><fieldset><legend>Seus dados</legend><div class="grid">
      ${f('pf_nome','Nome completo',{full:true})}${f('pf_cpf','CPF',{ph:'000.000.000-00'})}${f('nascimento','Data de nascimento',{type:'date'})}
      ${f('telefone','WhatsApp',{ph:'(48) 99999-9999'})}${f('pf_email','E-mail',{type:'email'})}</div></fieldset></div>
    <div data-sec="pj" ${pf?'hidden':''}><fieldset><legend>Empresa</legend><div class="grid">
      ${f('pj_razao','Razão social',{full:true})}${f('pj_cnpj','CNPJ',{ph:'00.000.000/0000-00'})}${f('pj_fin','E-mail para assuntos financeiros',{type:'email',hint:'Para onde vão boletos e notas fiscais.'})}</div></fieldset>
      <fieldset><legend>Responsável legal (quem assina)</legend><div class="grid">
      ${f('pj_rep','Nome completo',{full:true})}${f('pj_cpf','CPF do responsável',{ph:'000.000.000-00'})}${f('nascimento','Data de nascimento',{type:'date'})}
      ${f('pj_email','E-mail do responsável legal',{type:'email'})}${f('telefone','WhatsApp',{req:false,ph:'(48) 99999-9999'})}</div></fieldset></div>
    ${addr(pf?'Endereço':'Endereço da empresa')}
    <button>Enviar dados</button></form>
    <script>
    // Mostra só os campos do tipo escolhido; os da outra seção ficam desativados (não são enviados).
    const sync=()=>{const t=document.querySelector('[name=tipo]:checked').value;
      document.querySelectorAll('[data-sec]').forEach(s=>{const on=s.dataset.sec===t;s.hidden=!on;s.querySelectorAll('input').forEach(i=>i.disabled=!on);});
      document.querySelector('[data-addr]').textContent=t==='pf'?'Endereço':'Endereço da empresa';};
    document.querySelectorAll('[name=tipo]').forEach(r=>r.onchange=sync);sync();
    </script>`,n?400:200);
}

export async function GET(req:Request){
  const token=new URL(req.url).searchParams.get('t')||'',contract=await findContract(token);
  if(!contract)return page('Link inválido ou expirado','<p>Peça um novo link à equipe da Periférica.</p>',404);
  return form(token,contract,initial(contract));
}

export async function POST(req:Request){
  const fd=await req.formData(),token=String(fd.get('token')||''),contract=await findContract(token);
  if(!contract)return page('Link inválido ou expirado','<p>O link não é válido, já foi utilizado ou expirou. Peça outro à equipe da Periférica.</p>',404);
  const get=(k:string,max=200)=>String(fd.get(k)||'').trim().slice(0,max);
  const tipo=get('tipo')==='pf'?'pf':'pj';
  const v:Record<string,string>={tipo};
  const keys=tipo==='pf'?['pf_nome','pf_cpf','nascimento','telefone','pf_email']:['pj_razao','pj_cnpj','pj_fin','pj_rep','pj_cpf','nascimento','pj_email','telefone'];
  for(const k of [...keys,'logradouro','numero','complemento','bairro','cidade','cep'])v[k]=get(k,k==='logradouro'?300:200);
  const e:Record<string,string>={};
  const need=(k:string,msg='Preencha este campo.')=>{if(!v[k])e[k]=msg;};
  const phoneOk=(k:string)=>{if(v[k]&&!/^\d{10,13}$/.test(digits(v[k])))e[k]='Informe o WhatsApp com DDD.';};
  if(tipo==='pf'){
    if(v.pf_nome.length<5||!v.pf_nome.includes(' '))e.pf_nome='Informe o nome completo.';
    if(!validCpf(v.pf_cpf))e.pf_cpf='CPF inválido.';
    need('telefone');phoneOk('telefone');
    if(!validEmail(v.pf_email))e.pf_email='E-mail inválido.';
  }else{
    if(v.pj_razao.length<3)e.pj_razao='Informe a razão social.';
    if(!validCnpj(v.pj_cnpj))e.pj_cnpj='CNPJ inválido.';
    if(v.pj_rep.length<5||!v.pj_rep.includes(' '))e.pj_rep='Informe o nome completo do responsável.';
    if(!validCpf(v.pj_cpf))e.pj_cpf='CPF inválido.';
    if(!validEmail(v.pj_email))e.pj_email='E-mail inválido.';
    if(!validEmail(v.pj_fin))e.pj_fin='E-mail inválido.';
    phoneOk('telefone');
  }
  if(!validBirth(v.nascimento))e.nascimento='Data de nascimento inválida.';
  for(const k of ['logradouro','numero','bairro','cidade'])need(k);
  if(digits(v.cep).length!==8)e.cep='CEP inválido (8 números).';
  if(Object.keys(e).length)return form(token,contract,v,e);

  const pf=tipo==='pf';
  const nome=pf?v.pf_nome:v.pj_rep,cpf=fmtCpf(pf?v.pf_cpf:v.pj_cpf),email=pf?v.pf_email:v.pj_email;
  const company=pf?v.pf_nome:v.pj_razao,documento=pf?cpf:fmtCnpj(v.pj_cnpj);
  const data={...contract.data,tipo_pessoa:tipo,razao_social:company,documento,representante:nome,cpf_representante:cpf,nascimento:v.nascimento,
    telefone:v.telefone,email_socio:email,email_financeiro:pf?(contract.data.email_financeiro||email):v.pj_fin,
    logradouro:v.logradouro,numero:v.numero,complemento:v.complemento,bairro:v.bairro,cidade:v.cidade,cep:fmtCep(v.cep)};
  if(pf)delete (data as any).nome_fantasia;
  const now=Date.now(),db=database();
  const result=await db.prepare(`UPDATE contracts SET company=?,document=?,contact_name=?,phone=?,email=?,data=?,status='elab',
    form_hash=NULL,form_expires=NULL,updated_at=? WHERE id=? AND form_hash=? AND form_expires>? AND status='dados'`)
    .bind(company,documento,nome,v.telefone||contract.phone||'',email,JSON.stringify(data),now,contract.id,await sha256(token),now).run();
  if(!result.meta.changes)return page('Link inválido ou expirado','<p>O link já foi utilizado ou expirou. Peça outro à equipe da Periférica.</p>',409);
  const lead=await db.prepare('SELECT lead_id FROM contracts WHERE id=?').bind(contract.id).first<{lead_id:string|null}>();
  await db.prepare(`INSERT INTO contract_history(id,contract_id,lead_id,from_status,to_status,action,changed_by_name,created_at)
    VALUES(?,?,?,'dados','elab','dados_recebidos','Cliente',?)`).bind(crypto.randomUUID(),contract.id,lead?.lead_id||null,now).run();
  return page('Dados enviados','<p>Obrigado! Os dados foram enviados à equipe da Periférica para elaboração do contrato.</p>');
}
