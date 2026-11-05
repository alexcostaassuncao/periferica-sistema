/* Formulário de contrato (usado no Comercial e em Contratos).
   PF.contractForm({lead, contract, closed, onDone})
   - lead: gera o contrato a partir do lead (dados do cadastro já preenchidos)
   - contract: edita um contrato em elaboração / aguardando assinatura
   - closed: lista de leads fechados para escolher (Novo contrato em Contratos) */
(function(){
  const MODELS={'Gestão':['Gestão completa','Gestão sem social media','Gestão focada em tráfego','Gestão com produção de vídeo'],
    'Projetos':['Website institucional','Website catálogo','E-commerce','Identidade visual','Outros projetos']};
  const TERMS=['12 meses','6 meses','3 meses','Projeto único'];
  PF.contractModels=MODELS;

  PF.contractForm=function({lead=null,contract=null,closed=null,onDone}={}){
    const d=contract||lead||{};
    const kind=contract?.kind||(/projeto|site|e-?commerce|identidade/i.test(lead?.interest||'')?'Projetos':'Gestão');
    const m=PF.modal(`<div class="modal-head"><div><h3>${contract?'Editar contrato':'Gerar contrato'}</h3>
      <p class="muted small">${contract?PF.esc(contract.company):lead?'Os dados vêm do cadastro do lead. Confira e ajuste se precisar.':'Escolha um lead fechado ou preencha os dados.'}</p></div><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
    <form class="stack" id="cf">
      ${closed?`<label class="field"><span>Lead fechado no Comercial</span><select class="select-in" name="leadId"><option value="">Sem lead (preencher manualmente)</option>${closed.map(l=>`<option value="${l.id}">${PF.esc(l.company)}${l.contact_name?' – '+PF.esc(l.contact_name):''}</option>`).join('')}</select>
        <small class="muted tiny">Escolhendo um lead, os dados do cadastro dele são usados no contrato e no cliente.</small></label>`:''}
      <div class="grid g2"><label class="field"><span>Tipo</span><select class="select-in" name="kind">${Object.keys(MODELS).map(k=>`<option ${k===kind?'selected':''}>${k}</option>`).join('')}</select></label>
        <label class="field"><span>Modelo</span><select class="select-in" name="model"></select></label></div>
      <div class="grid g2"><label class="field"><span>Valor</span><input class="input" name="value" value="${PF.esc(contract?.value||'')}" placeholder="R$ 2.500,00/mês"></label>
        <label class="field"><span>Vigência</span><select class="select-in" name="term">${TERMS.map(t=>`<option ${t===contract?.term?'selected':''}>${t}</option>`).join('')}</select></label></div>
      <fieldset id="client" style="border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:12px">
        <legend class="small muted" style="padding:0 6px">Dados do cliente</legend>
        <div class="grid g2"><label class="field"><span>Empresa</span><input class="input" name="company" value="${PF.esc(d.company||'')}"></label>
          <label class="field"><span>CNPJ / CPF</span><input class="input" name="document" value="${PF.esc(contract?.document||'')}"></label></div>
        <div class="grid g2"><label class="field"><span>Segmento</span><input class="input" name="segment" value="${PF.esc(d.segment||'')}"></label>
          <label class="field"><span>Contato</span><input class="input" name="contact_name" value="${PF.esc(d.contact_name||'')}"></label></div>
        <div class="grid g2"><label class="field"><span>WhatsApp</span><input class="input" name="phone" value="${PF.esc(d.phone||'')}"></label>
          <label class="field"><span>Email</span><input class="input" type="email" name="email" value="${PF.esc(d.email||'')}"></label></div>
      </fieldset>
      <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="cfSave"><i data-lucide="${contract?'save':'file-plus'}"></i>${contract?'Salvar':'Gerar contrato'}</button></div>
    </form>`,{side:true});
    const f=m.el.querySelector('#cf'),F=f.elements;
    const fill=()=>{F.model.innerHTML=MODELS[F.kind.value].map(x=>`<option ${x===contract?.model?'selected':''}>${x}</option>`).join('');};
    F.kind.onchange=fill;fill();
    // Com lead escolhido na lista, os dados do cliente vêm do cadastro dele (campos ficam em branco = usar os do lead).
    if(F.leadId)F.leadId.onchange=()=>{const sel=!!F.leadId.value;m.el.querySelector('#client').style.display=sel?'none':'';};
    f.onsubmit=async e=>{
      e.preventDefault();
      const body=Object.fromEntries(new FormData(f));
      const btn=m.el.querySelector('#cfSave');btn.disabled=true;
      try{
        if(contract){await PF.api('/api/contracts',{method:'PATCH',body:{id:contract.id,action:'edit',...body}});PF.toast('Contrato atualizado.','ok');}
        else{
          if(lead)body.leadId=lead.id;
          if(body.leadId){for(const k of ['company','segment','contact_name','phone','email'])if(F.leadId&&!body[k])delete body[k];}
          else if(!String(body.company||'').trim())throw Error('Informe o nome da empresa.');
          await PF.api('/api/contracts',{method:'POST',body});
          PF.toast('Contrato gerado! Ele está em Contratos → Em elaboração.','ok');
        }
        m.close();onDone&&onDone();
      }catch(x){PF.toast(x.message,'err');btn.disabled=false;}
    };
  };
})();
