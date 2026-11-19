/* Formulário do contrato (usado no Comercial e em Contratos).
   PF.contractForm({lead, contract, closed, onDone})
   - Preenche sozinho com os dados do lead, os preços do plano, as datas e a multa (tudo editável).
   - Os campos mudam conforme o modelo: Gestão (planos), Website ou E-commerce. */
(function(){
  const MODELS={'Gestão':['ADS PRO','ADS PRO + SOCIAL MEDIA','SMART BUSINESS','TRÁFEGO LIGHT','SOCIAL MEDIA','PERSONALIZADO'],
    'Projetos':['Website','E-commerce (Tray)','Identidade visual','Outros projetos']};
  const FORMAS=['Boleto','PIX','Cartão de crédito','Boleto ou PIX','Cartão ou Boleto','Transferência'];
  PF.contractModels=MODELS;
  const esc=PF.esc;
  const modeloDe=(kind,model)=>kind==='Gestão'?'gestao':/e-?commerce|loja/i.test(model)?'ecommerce':/site|website/i.test(model)?'site':null;

  const f=(name,label,val,{type='text',ph='',cls='',list=null,step=null,full=false}={})=>`<label class="field ${full?'full':''}"><span>${label}</span>${
    list?`<select class="select-in" name="${name}">${list.map(o=>`<option ${String(o)===String(val??'')?'selected':''}>${esc(o)}</option>`).join('')}</select>`
    :type==='area'?`<textarea class="input" name="${name}" placeholder="${esc(ph)}" style="min-height:${cls||'90px'}">${esc(val??'')}</textarea>`
    :`<input class="input" name="${name}" type="${type}" ${step?`step="${step}"`:''} value="${esc(val??'')}" placeholder="${esc(ph)}">`}</label>`;

  function camposContratante(d){
    return `<fieldset class="cf-box"><legend>Contratante (cliente)</legend>
      <div class="cf-grid">${f('razao_social','Razão social / Nome',d.razao_social,{full:true})}
      ${f('documento','CNPJ ou CPF',d.documento)}${f('nome_fantasia','Nome fantasia',d.nome_fantasia)}
      ${f('logradouro','Rua / Avenida',d.logradouro,{full:true})}${f('numero','Número',d.numero)}${f('complemento','Complemento',d.complemento,{ph:'sala, andar…'})}
      ${f('bairro','Bairro',d.bairro)}${f('cidade','Cidade/UF',d.cidade,{ph:'Criciúma/SC'})}${f('cep','CEP',d.cep)}
      ${f('representante','Sócio que assina',d.representante)}${f('cpf_representante','CPF do sócio',d.cpf_representante)}${f('nascimento','Data de nascimento',d.nascimento,{type:'date'})}
      ${f('email_socio','E-mail do sócio',d.email_socio,{type:'email'})}${f('email_financeiro','E-mail financeiro (faturas)',d.email_financeiro,{type:'email'})}${f('telefone','WhatsApp',d.telefone)}
      </div></fieldset>`;
  }
  function camposGestao(d){
    return `<fieldset class="cf-box"><legend>Redes do cliente</legend><div class="cf-grid">
        ${f('instagram','Instagram (link)',d.instagram,{ph:'https://www.instagram.com/…',full:true})}${f('facebook','Facebook (link)',d.facebook,{ph:'https://www.facebook.com/…',full:true})}</div></fieldset>
      <fieldset class="cf-box"><legend>Plano e prazos</legend><div class="cf-grid">
        ${f('modalidade','Modalidade',d.modalidade||'Semestral',{list:['Mensal','Semestral','Anual']})}${f('vigencia_meses','Vigência mínima (meses)',d.vigencia_meses,{type:'number'})}${f('data_contrato','Data do contrato',d.data_contrato,{type:'date'})}
        ${f('inicio','Início',d.inicio,{type:'date'})}${f('termino','Término',d.termino,{type:'date'})}${f('invest_minimo','Investimento mínimo em anúncios (R$)',d.invest_minimo)}
        ${f('itens_plano','Itens do plano (linha em MAIÚSCULAS vira título)',d.itens_plano,{type:'area',cls:'180px',full:true})}
        ${f('observacoes_extras','Observações extras (uma por linha, opcional)',d.observacoes_extras,{type:'area',cls:'60px',full:true})}</div></fieldset>
      <fieldset class="cf-box"><legend>Entregas do plano (o que o plano inclui)</legend><div class="cf-grid">
        ${[['social','Social Media (posts)'],['campanha','Campanha (criativos)'],['video_organico','Vídeo orgânico (vídeos)'],['video_campanha','Vídeo de campanha (vídeos)']].map(([k,l])=>
          f('entrega_'+k+'_qtd',l,d['entrega_'+k+'_qtd']??0,{type:'number'})+f('entrega_'+k+'_freq','Frequência',d['entrega_'+k+'_freq']||'mes',{list:['mes','semana']})+'<span></span>').join('')}
        </div><p class="muted tiny" style="margin-top:6px">"semana" = quantidade por semana de produção (o sistema multiplica pelas semanas do mês). "mes" = quantidade fixa no mês.</p></fieldset>
      <fieldset class="cf-box"><legend>Valores e pagamento</legend><div class="cf-grid">
        ${f('implantacao_valor','Implantação (R$) — 0 = sem implantação',d.implantacao_valor)}${f('implantacao_forma','Forma',d.implantacao_forma,{list:FORMAS})}${f('implantacao_vencimento','Vencimento da implantação',d.implantacao_vencimento,{type:'date'})}
        ${f('mensal_valor','Mensalidade (R$)',d.mensal_valor)}${f('mensal_forma','Forma',d.mensal_forma,{list:FORMAS})}${f('mensal_dia','Dia do vencimento mensal',d.mensal_dia,{type:'number'})}
        ${f('social_valor','Social Media cobrado à parte (R$, opcional)',d.social_valor)}
        ${f('implantacao_obs','Condição especial da implantação (opcional)',d.implantacao_obs,{ph:'Ex.: parcelado R$ 500 em 15/6 e R$ 500 em 15/7',full:true})}
        ${f('mensal_obs','Condição especial da mensalidade (opcional)',d.mensal_obs,{ph:'Ex.: a primeira parcela vence em 10/07 e as demais todo dia 10',full:true})}
        ${f('multa','Multa rescisória (uma faixa por linha)',d.multa,{type:'area',cls:'80px',full:true})}</div></fieldset>`;
  }
  function camposSite(d){
    return `<fieldset class="cf-box"><legend>Website</legend><div class="cf-grid">
        ${f('paginas','Páginas',d.paginas,{type:'number'})}${f('prazo_dias','Prazo de desenvolvimento (dias)',d.prazo_dias,{type:'number'})}${f('data_contrato','Data do contrato',d.data_contrato,{type:'date'})}
        ${f('lista_paginas','Páginas do site (uma por linha)',d.lista_paginas||'Home\nQuem Somos\nTrabalhe conosco\nServiços\nContatos',{type:'area',cls:'90px',full:true})}
        ${f('itens_extras','Itens extras (opcional, um por linha)',d.itens_extras,{type:'area',cls:'50px',full:true})}</div></fieldset>
      <fieldset class="cf-box"><legend>Valor</legend><div class="cf-grid">
        ${f('valor_total','Valor total (R$)',d.valor_total)}${f('parcelas','Parcelas',d.parcelas,{type:'number'})}${f('forma_pagamento','Forma',d.forma_pagamento,{list:['cartão de crédito','boleto','PIX']})}
        ${f('condicao_pagamento','Condição especial (opcional)',d.condicao_pagamento,{full:true})}${f('multa_percentual','Multa por desistência (%)',d.multa_percentual,{type:'number'})}</div></fieldset>
      <fieldset class="cf-box"><legend>Hospedagem</legend><div class="cf-grid">
        ${f('hospedagem_plano','Plano',d.hospedagem_plano)}${f('hospedagem_valor','Mensalidade (R$, 0 = sem cobrança)',d.hospedagem_valor)}${f('hospedagem_forma','Forma',d.hospedagem_forma,{list:['boleto','cartão de crédito','PIX']})}
        ${f('hospedagem_vencimento','1º vencimento',d.hospedagem_vencimento,{type:'date'})}${f('hospedagem_termino','Término',d.hospedagem_termino,{type:'date'})}
        ${f('hospedagem_bonus','Bônus (opcional)',d.hospedagem_bonus,{ph:'Ex.: primeiro ano grátis',full:true})}</div></fieldset>`;
  }
  function camposEcom(d){
    return `<fieldset class="cf-box"><legend>E-commerce (Tray)</legend><div class="cf-grid">
        ${f('prazo_dias','Prazo (dias úteis)',d.prazo_dias,{type:'number'})}${f('data_contrato','Data do contrato',d.data_contrato,{type:'date'})}
        ${f('valor_total','Desenvolvimento (R$)',d.valor_total)}${f('parcelas','Parcelas',d.parcelas,{type:'number'})}${f('forma_pagamento','Forma',d.forma_pagamento,{list:['cartão de crédito','boleto','PIX']})}
        ${f('suporte_valor','Suporte mensal (R$)',d.suporte_valor)}${f('suporte_meses','Meses de suporte',d.suporte_meses,{type:'number'})}${f('suporte_forma','Forma do suporte',d.suporte_forma||d.forma_pagamento,{list:['cartão de crédito','boleto','PIX']})}
        ${f('condicao_pagamento','Condição especial (opcional)',d.condicao_pagamento,{ph:'Ex.: entrada + 5 parcelas no boleto',full:true})}${f('multa_percentual','Multa por desistência (%)',d.multa_percentual,{type:'number'})}</div></fieldset>`;
  }

  PF.contractForm=async function({lead=null,contract=null,closed=null,onDone}={}){
    // Dados de partida: contrato existente → seus dados; lead → cadastro do lead.
    const fromLead=l=>l?{razao_social:l.company,representante:l.contact_name,telefone:l.phone,email_socio:l.email,email_financeiro:l.email}:{};
    let kind=contract?.kind||'Gestão';
    let model=contract?.model||(/site|website/i.test(lead?.interest||'')?'Website':/e-?commerce|loja/i.test(lead?.interest||'')?'E-commerce (Tray)':'ADS PRO');
    if(/site|website|e-?commerce|loja/i.test(model))kind='Projetos';
    let dados=contract?{razao_social:contract.company,documento:contract.document,representante:contract.contact_name,telefone:contract.phone,email_socio:contract.email,...contract.data}:fromLead(lead);

    const m=PF.modal(`<div class="modal-head"><div><h3>${contract?'Editar contrato':'Gerar contrato'}</h3>
      <p class="muted small">Usa o modelo da Periférica. Só os dados do cliente, valores e datas mudam.</p></div><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
      <form id="cf" class="stack">
        ${closed?`<label class="field"><span>Lead fechado no Comercial</span><select class="select-in" name="leadId"><option value="">Sem lead (preencher manualmente)</option>${closed.map(l=>`<option value="${l.id}">${esc(l.company)}${l.contact_name?' – '+esc(l.contact_name):''}</option>`).join('')}</select></label>`:''}
        <div class="cf-grid">
          <label class="field"><span>Tipo</span><select class="select-in" name="kind">${Object.keys(MODELS).map(k=>`<option ${k===kind?'selected':''}>${k}</option>`).join('')}</select></label>
          <label class="field"><span>${kind==='Gestão'?'Plano':'Modelo'}</span><select class="select-in" name="model"></select></label>
        </div>
        <div id="cfBody"></div>
        <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>Cancelar</button>
          <button class="btn btn-ghost" data-then="pdf"><i data-lucide="file-search"></i>Salvar e ver PDF</button>
          <button class="btn btn-primary" data-then="close"><i data-lucide="save"></i>${contract?'Salvar':'Gerar contrato'}</button></div>
      </form>
      <style>.cf-box{border:1px solid var(--line);border-radius:12px;padding:12px;margin:0}.cf-box legend{padding:0 6px;font-size:12.5px;color:var(--soft);font-weight:600}
        .cf-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.cf-grid .full{grid-column:1/-1}
        @media(max-width:700px){.cf-grid{grid-template-columns:1fr}}</style>`,{side:true,wide:true});
    m.el.style.width='min(860px,100%)';
    const form=m.el.querySelector('#cf'),F=form.elements,body=m.el.querySelector('#cfBody');
    // Guarda o que já foi digitado ao trocar de plano/modelo.
    const ler=()=>{const o={};body.querySelectorAll('[name]').forEach(i=>{o[i.name]=i.value;});return o;};
    async function sugerir(manter){
      const q=new URLSearchParams({kind:F.kind.value,model:F.model.value,modalidade:(manter&&manter.modalidade)||dados.modalidade||'Semestral'});
      let r={modelo:modeloDe(F.kind.value,F.model.value),sugestao:{}};
      try{r=await PF.api('/api/contracts/sugestao?'+q);}catch{}
      return r;
    }
    const fillModels=()=>{F.model.innerHTML=MODELS[F.kind.value].map(x=>`<option ${x===model?'selected':''}>${x}</option>`).join('');model=F.model.value;};
    async function render(trocouPlano){
      const atual=ler();
      const r=await sugerir(atual);
      // Sugestões do plano entram por baixo; o que já foi preenchido (cliente) fica por cima.
      // Ao trocar o plano/modalidade, preços, itens, datas e multa voltam ao padrão do novo plano.
      const PLANO_KEYS=['implantacao_valor','mensal_valor','itens_plano','multa','vigencia_meses','termino','invest_minimo','modalidade'];
      const base={...r.sugestao,...dados,...atual};
      if(trocouPlano)for(const k of PLANO_KEYS)if(r.sugestao[k]!==undefined&&!(k==='modalidade'&&atual.modalidade))base[k]=r.sugestao[k];
      dados=base;
      body.innerHTML=!r.modelo?`<div class="note"><i data-lucide="file-x"></i><div>Ainda não há modelo de contrato para <b>${esc(F.model.value)}</b>. O contrato fica registrado, mas o PDF precisa ser feito à parte. Modelos prontos: planos de Gestão, Website e E-commerce.</div></div>${camposContratante(base)}`
        :camposContratante(base)+(r.modelo==='gestao'?camposGestao(base):r.modelo==='site'?camposSite(base):camposEcom(base));
      PF.icons();
      // Modalidade muda vigência, término, preços e multa.
      const mod=body.querySelector('[name=modalidade]');if(mod)mod.onchange=()=>render(true);
      const ini=body.querySelector('[name=inicio]'),vig=body.querySelector('[name=vigencia_meses]');
      const recalcula=()=>{if(!ini?.value||!vig?.value)return;const d=new Date(ini.value+'T12:00');d.setMonth(d.getMonth()+Number(vig.value));d.setDate(d.getDate()-1);body.querySelector('[name=termino]').value=d.toISOString().slice(0,10);};
      if(ini)ini.onchange=recalcula;if(vig)vig.onchange=recalcula;
    }
    F.kind.onchange=()=>{model=MODELS[F.kind.value][0];fillModels();render(true);};
    F.model.onchange=()=>{model=F.model.value;render(true);};
    if(F.leadId)F.leadId.onchange=()=>{const l=closed.find(x=>x.id===F.leadId.value);dados={...dados,...fromLead(l)};body.querySelectorAll('[name]').forEach(i=>{const v=fromLead(l)[i.name];if(v)i.value=v;});};
    fillModels();await render(false);

    form.onsubmit=async e=>{
      e.preventDefault();
      const then=e.submitter?.dataset.then||'close';
      const data=ler();
      // Números: "1.590,00" → 1590
      for(const k of Object.keys(data))if(/_valor$|^valor_total$|^invest_minimo$/.test(k)&&data[k]!=='')data[k]=Number(String(data[k]).replace(/[^\d,.-]/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.'))||0;
      if(!String(data.razao_social||'').trim())return PF.toast('Informe a razão social / nome do cliente.','err');
      const resumo=data.mensal_valor?`${PF.brl(data.mensal_valor)}/mês`:data.valor_total?PF.brl(data.valor_total):'';
      const body2={kind:F.kind.value,model:F.model.value,company:data.razao_social,document:data.documento||'',contact_name:data.representante||'',phone:data.telefone||'',email:data.email_socio||'',
        segment:lead?.segment||contract?.segment||'',value:resumo,term:data.modalidade||'',data};
      const btns=m.el.querySelectorAll('.modal-foot .btn');btns.forEach(b=>b.disabled=true);
      try{
        let id=contract?.id;
        if(contract)await PF.api('/api/contracts',{method:'PATCH',body:{id,action:'edit',...body2}});
        else{if(lead)body2.leadId=lead.id;else if(F.leadId?.value)body2.leadId=F.leadId.value;id=(await PF.api('/api/contracts',{method:'POST',body:body2})).id;}
        PF.toast(contract?'Contrato atualizado.':'Contrato gerado! Ele está em Contratos → Em elaboração.','ok');
        m.close();onDone&&onDone(id);
        if(then==='pdf')window.open('/api/contracts/pdf?id='+encodeURIComponent(id),'_blank');
      }catch(x){PF.toast(x.message,'err');btns.forEach(b=>b.disabled=false);}
    };
  };

  // Enviar contrato: email (PDF anexo) ou WhatsApp (link do PDF)
  PF.contractSend=function(c,via,onDone){
    if(via==='whatsapp'){
      const fone=String(c.phone||c.data?.telefone||'').replace(/\D/g,'');
      PF.api('/api/contracts',{method:'PATCH',body:{id:c.id,action:'share'}}).then(r=>{
        const nome=(c.contact_name||'').split(' ')[0];
        const msg=`Olá${nome?' '+nome:''}! Tudo bem?\n\nSegue o link do contrato de parceria com a Periférica Assessoria de Marketing para conferência:\n${r.url}\n\nQualquer dúvida estou à disposição. Abraço!`;
        window.open(`https://wa.me/${fone?(fone.length<=11?'55'+fone:fone):''}?text=${encodeURIComponent(msg)}`,'_blank');
        PF.toast('Link do contrato gerado (vale 30 dias).','ok');onDone&&onDone();
      }).catch(e=>PF.toast(e.message,'err'));
      return;
    }
    const para=c.data?.email_socio||c.email||'';
    const m=PF.modal(`<div class="modal-head"><div><h3>Enviar contrato por email</h3><p class="muted small">${esc(c.company)} · o PDF vai anexado.</p></div><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
      <form class="stack" id="em">
        <label class="field"><span>Para</span><input class="input" type="email" name="to" required value="${esc(para)}"></label>
        <label class="field"><span>Assunto</span><input class="input" name="subject" value="${esc('Contrato – '+c.company+' | Periférica')}"></label>
        <label class="field"><span>Mensagem</span><textarea class="input" name="message" style="min-height:150px">Olá! Tudo bem?

Segue o contrato de parceria com a Periférica Assessoria de Marketing para conferência e assinatura. Qualquer dúvida estou à disposição.

Abraço!
${esc(PF.user.name||'')}</textarea></label>
        <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="emGo"><i data-lucide="send"></i>Enviar</button></div>
      </form>`);
    m.el.querySelector('#em').onsubmit=async e=>{
      e.preventDefault();const b=m.el.querySelector('#emGo');b.disabled=true;b.textContent='Enviando…';
      try{await PF.api('/api/contracts',{method:'PATCH',body:{id:c.id,action:'email',...Object.fromEntries(new FormData(e.target))}});m.close();PF.toast('Contrato enviado por email!','ok');onDone&&onDone();}
      catch(x){PF.toast(x.message,'err');b.disabled=false;b.innerHTML='<i data-lucide="send"></i>Enviar';PF.icons();}
    };
  };
})();
