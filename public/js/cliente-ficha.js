/* Ficha completa do cliente (clientes.html?id=...)
   Cadastro e contato · origem comercial · carteira e equipe · serviços e contratos · documentos
   · histórico de contatos e reuniões · cofre de senhas (só com permissão) · onboarding */
(function(){
  const esc=PF.esc;
  const STATUS={ativo:['Ativo','green'],inativo:['Inativo','gray'],pausado:['Pausado','yellow']};
  const PHASE={'':['Aguardando onboarding','yellow'],onboarding:['Em onboarding','blue'],gestao:['Em Gestão','green']};
  const KIND={contato:['Contato','phone','blue'],reuniao:['Reunião','users','purple'],nota:['Anotação','sticky-note','yellow'],sistema:['Sistema','bot','gray']};
  const CST={elab:['Em elaboração','blue'],aguard:['Aguardando assinatura','yellow'],assin:['Assinado','green'],canc:['Cancelado','pink']};
  const fdt=v=>v?new Date(typeof v==='number'?v:v).toLocaleDateString('pt-BR'):'—';
  const fdh=v=>new Date(v).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});

  PF.clienteFicha=async function(content,id){
    let D=null,people=[],tab=sessionStorage.getItem('pf-ficha-tab')||'geral';
    async function load(){
      try{[D,people]=await Promise.all([PF.api('/api/clients/detail?id='+encodeURIComponent(id)),PF.api('/api/people').then(r=>r.people)]);}
      catch(e){content.innerHTML=`<div class="card empty"><i data-lucide="search-x"></i><div>${esc(e.message)}</div><a class="btn btn-ghost" href="clientes.html" style="margin-top:12px">Voltar para Clientes</a></div>`;PF.icons();return;}
      render();
    }
    const post=async(body,msg)=>{try{await PF.api('/api/clients/detail',{method:'POST',body:{client_id:id,...body}});if(msg)PF.toast(msg,'ok');await load();}catch(e){PF.toast(e.message,'err');}};

    function render(){
      const c=D.client,ob=D.onboarding,ph=PHASE[c.phase]||PHASE[''];
      document.title='Periférica · '+c.name;
      document.querySelector('.crumbs').innerHTML=`<a href="clientes.html">Clientes</a><i data-lucide="chevron-right"></i><span>${esc(c.name)}</span>`;
      document.querySelector('.page-title h1').innerHTML=`<a href="clientes.html" class="icon-btn" title="Voltar" style="display:inline-grid;vertical-align:-4px;margin-right:4px"><i data-lucide="arrow-left"></i></a>${esc(c.name)}`;
      const signed=D.contracts.filter(x=>x.status==='assin');
      const tabs=[['geral','Visão geral'],['equipe','Equipe'],['servicos','Serviços e contratos'],['docs','Documentos'],['historico','Histórico'],...(D.canVault?[['cofre','Cofre de senhas']]:[])];
      if(!tabs.some(t=>t[0]===tab))tab='geral';
      content.innerHTML=`
      <div class="card mb hero">
        ${PF.chip(c.name,'lg')}
        <div style="flex:1;min-width:240px">
          <h2>${esc(c.name)} ${PF.badge(...(STATUS[c.status]||[c.status,'gray']))} ${PF.badge(...ph)}</h2>
          <div class="muted small">${esc(c.segment||'Segmento não informado')}${c.squad?' · Carteira '+c.squad:' · Sem carteira'}${D.lead?.source?' · Origem: '+esc(D.lead.source):''}</div>
          <div class="facts">
            <div><i data-lucide="calendar"></i><div>${fdt(c.created_at)}<small>Cliente desde</small></div></div>
            <div><i data-lucide="user"></i><div>${esc(c.contact_name||'—')}<small>Contato do cliente</small></div></div>
            <div><i data-lucide="phone"></i><div>${c.phone?`<a href="https://wa.me/55${c.phone.replace(/\D/g,'')}" target="_blank" rel="noopener">${esc(c.phone)}</a>`:'—'}<small>WhatsApp</small></div></div>
            <div><i data-lucide="mail"></i><div>${c.email?`<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`:'—'}<small>E-mail</small></div></div>
          </div>
        </div>
        <div class="stack" style="gap:8px;align-items:flex-end">
          ${ob?`<a class="btn btn-ghost" href="onboarding.html?id=${ob.id}"><i data-lucide="list-checks"></i>Onboarding ${ob.status==='concluido'?'concluído':'— '+(ob.progress?.pct||0)+'%'}</a>`
            :c.status==='ativo'?`<button class="btn btn-primary" id="startOb"><i data-lucide="play"></i>Iniciar onboarding</button>`:''}
          <button class="btn btn-ghost" id="edit"><i data-lucide="pencil"></i>Editar cadastro</button>
        </div>
      </div>
      <div class="tabs">${tabs.map(([k,l])=>`<button data-t="${k}" class="${k===tab?'on':''}">${l}${k==='historico'?`<span class="count">${D.events.length}</span>`:k==='servicos'?`<span class="count">${signed.length}</span>`:''}</button>`).join('')}</div>
      <div id="pane"></div>`;
      const pane=content.querySelector('#pane');
      ({geral,equipe,servicos,docs,historico,cofre})[tab](pane);
      PF.icons();
      content.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;sessionStorage.setItem('pf-ficha-tab',tab);render();});
      content.querySelector('#edit').onclick=editar;
      const st=content.querySelector('#startOb');if(st)st.onclick=iniciar;
    }

    function geral(p){
      const c=D.client,l=D.lead,ob=D.onboarding;
      const team=D.team.filter(t=>t.name);
      p.innerHTML=`<div class="grid g2">
        <div class="card"><div class="card-head"><h3>Cadastro</h3></div>
          <div class="info"><span>Razão social / nome</span><b>${esc(c.name)}</b><span>Segmento</span><b>${esc(c.segment||'—')}</b>
          <span>Carteira (squad)</span><b>${c.squad||'—'}</b><span>Serviços</span><b>${esc(c.services||'—')}</b>
          <span>Situação</span><b>${(STATUS[c.status]||[c.status])[0]}</b><span>Fase</span><b>${(PHASE[c.phase]||PHASE[''])[0]}</b>
          <span>Redes conectadas</span><b>${D.social.map(s=>s.network==='instagram'?'@'+esc(s.username):'Facebook: '+esc(s.name)).join(' · ')||'Nenhuma'}</b></div></div>
        <div class="card"><div class="card-head"><h3>Origem comercial</h3>${c.lead_id?'<a class="link tiny" href="comercial.html">Ver no Comercial</a>':''}</div>
          ${l?`<div class="info"><span>Origem do lead</span><b>${esc(l.source||'—')}</b><span>Interesse</span><b>${esc(l.interest||'—')}</b><span>Vendedor</span><b>${esc(l.owner_name||(l.owner_id==='admin'?'Administrador':'—'))}</b><span>Entrada no CRM</span><b>${fdt(l.created_at)}</b></div>
            ${l.notes?`<div class="field" style="margin-top:12px"><span>Anotações da negociação</span><div class="small muted" style="white-space:pre-wrap;line-height:1.5">${esc(l.notes)}</div></div>`:''}`
            :'<div class="muted small">Cliente cadastrado direto (sem passar pelo Comercial).</div>'}</div>
        <div class="card"><div class="card-head"><h3>Equipe interna</h3><button class="link tiny" data-go="equipe">Editar</button></div>
          ${team.length?team.map(t=>`<div class="li">${PF.avatar(t.name,'md')}<div class="t"><b>${esc(t.name)}</b><span>${t.label}</span></div></div>`).join(''):'<div class="muted small">Ninguém definido ainda.</div>'}</div>
        <div class="card"><div class="card-head"><h3>Últimos acontecimentos</h3><button class="link tiny" data-go="historico">Ver histórico</button></div>
          ${D.events.slice(0,5).map(e=>`<div class="li"><span class="ico sm c-${KIND[e.kind][2]}"><i data-lucide="${KIND[e.kind][1]}"></i></span><div class="t"><b>${esc(e.title)}</b><span>${fdh(e.happened_at)} · ${esc(e.author_name)}</span></div></div>`).join('')||'<div class="muted small">Nada registrado ainda.</div>'}</div>
      </div>
      ${!ob&&c.status==='ativo'?`<div class="note" style="margin-top:14px"><i data-lucide="info"></i><div>Cliente <b>ativo</b>, mas o <b>onboarding ainda não começou</b>. Clique em <b>Iniciar onboarding</b> no topo quando for a hora.</div></div>`:''}`;
      p.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{tab=b.dataset.go;render();});
    }

    function equipe(p){
      const c=D.client;
      p.innerHTML=`<div class="card"><div class="card-head"><div><h3>Carteira e equipe interna</h3><p>Quem cuida deste cliente em cada área.</p></div></div>
        <div class="grid g3">
          <label class="field"><span>Carteira (squad)</span><select class="select-in" id="squad">${['','C1','C2','C3'].map(s=>`<option value="${s}" ${c.squad===s?'selected':''}>${s||'— sem carteira —'}</option>`).join('')}</select></label>
          ${D.team.map(t=>`<label class="field"><span>${t.label}</span><select class="select-in" data-role="${t.role}"><option value="">— ninguém —</option>${people.map(pp=>`<option value="${pp.id}" ${pp.id===t.user_id?'selected':''}>${esc(pp.name)}${pp.role?' · '+esc(pp.role):''}</option>`).join('')}</select></label>`).join('')}
        </div><p class="muted tiny" style="margin-top:10px">As mudanças são salvas na hora e ficam no histórico.</p></div>`;
      p.querySelector('#squad').onchange=async e=>{try{await PF.api('/api/clients',{method:'PATCH',body:{id,squad:e.target.value}});await post({action:'event',kind:'nota',title:'Carteira alterada para '+(e.target.value||'nenhuma')},'Carteira salva.');}catch(x){PF.toast(x.message,'err');}};
      p.querySelectorAll('[data-role]').forEach(s=>s.onchange=()=>post({action:'team',role:s.dataset.role,user_id:s.value},'Equipe salva.'));
    }

    function servicos(p){
      p.innerHTML=`<div class="card"><div class="card-head"><div><h3>Serviços e contratos</h3><p>Todos os contratos ligados a este cliente.</p></div><a class="btn btn-ghost btn-sm" href="contratos.html"><i data-lucide="file-signature"></i>Ir para Contratos</a></div>
        ${D.contracts.length?`<div class="table-wrap"><table class="tbl"><thead><tr><th>Serviço</th><th>Plano / modelo</th><th>Valor</th><th>Modalidade</th><th>Status</th><th>Assinado em</th><th></th></tr></thead><tbody>
        ${D.contracts.map(k=>`<tr><td>${esc(k.kind)}</td><td><b>${esc(k.model)}</b></td><td>${esc(k.value||'—')}</td><td>${esc(k.term||'—')}</td><td>${PF.badge(...(CST[k.status]||[k.status,'gray']))}</td><td>${fdt(k.signed_at)}</td>
          <td class="right">${k.kind==='Gestão'||/site|e-?commerce/i.test(k.model)?`<a class="icon-btn" title="Ver PDF" href="/api/contracts/pdf?id=${k.id}" target="_blank" rel="noopener"><i data-lucide="file-text"></i></a>`:''}</td></tr>`).join('')}
        </tbody></table></div>`:'<div class="empty"><i data-lucide="file-x"></i><div>Nenhum contrato ligado a este cliente.</div></div>'}</div>`;
    }

    function docs(p){
      const contr=D.contracts.filter(k=>k.status!=='canc'&&(k.kind==='Gestão'||/site|e-?commerce/i.test(k.model)));
      p.innerHTML=`<div class="card"><div class="card-head"><div><h3>Documentos</h3><p>Contratos gerados pelo sistema e links de arquivos (Drive, briefing, manual da marca…).</p></div><button class="btn btn-primary btn-sm" id="addDoc"><i data-lucide="plus"></i>Adicionar link</button></div>
        ${contr.map(k=>`<div class="li"><span class="ico sm c-orange"><i data-lucide="file-text"></i></span><div class="t"><b>Contrato – ${esc(k.model)}</b><span>Gerado pelo sistema · ${(CST[k.status]||[''])[0]}</span></div><a class="btn btn-ghost btn-sm" href="/api/contracts/pdf?id=${k.id}" target="_blank" rel="noopener">Abrir PDF</a></div>`).join('')}
        ${D.documents.map(d=>`<div class="li"><span class="ico sm c-blue"><i data-lucide="link"></i></span><div class="t"><b>${esc(d.name)}</b><span>${esc(d.created_by)} · ${fdt(d.created_at)}</span></div><a class="btn btn-ghost btn-sm" href="${esc(d.url)}" target="_blank" rel="noopener">Abrir</a><button class="icon-btn" data-del="${d.id}" title="Remover"><i data-lucide="trash-2"></i></button></div>`).join('')}
        ${!contr.length&&!D.documents.length?'<div class="empty"><i data-lucide="folder-open"></i><div>Nenhum documento ainda.</div></div>':''}</div>`;
      p.querySelector('#addDoc').onclick=()=>{
        const m=PF.modal(`<div class="modal-head"><h3>Adicionar documento</h3><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
          <form class="stack" id="f"><label class="field"><span>Nome</span><input class="input" name="name" required placeholder="Ex.: Manual da marca"></label>
          <label class="field"><span>Link</span><input class="input" name="url" required placeholder="https://drive.google.com/…"></label>
          <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Salvar</button></div></form>`);
        m.el.querySelector('#f').onsubmit=async e=>{e.preventDefault();m.close();await post({action:'doc',...Object.fromEntries(new FormData(e.target))},'Documento adicionado.');};
      };
      p.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{if(confirm('Remover este link?'))post({action:'doc_delete',id:b.dataset.del},'Removido.');});
    }

    function historico(p){
      let filtro='';
      const draw=()=>{
        const list=D.events.filter(e=>!filtro||e.kind===filtro);
        p.innerHTML=`<div class="card"><div class="card-head"><div><h3>Histórico</h3><p>Contatos, reuniões, anotações e tudo o que o sistema registra sozinho.</p></div><button class="btn btn-primary btn-sm" id="addEv"><i data-lucide="plus"></i>Registrar</button></div>
          <div class="filters">${PF.select('fk','Tipo',[['','Todos'],['contato','Contatos'],['reuniao','Reuniões'],['nota','Anotações'],['sistema','Sistema']])}</div>
          ${list.map(e=>`<div class="li" style="align-items:flex-start"><span class="ico sm c-${KIND[e.kind][2]}"><i data-lucide="${KIND[e.kind][1]}"></i></span>
            <div class="t"><b style="white-space:normal">${esc(e.title)}</b><span>${KIND[e.kind][0]} · ${fdh(e.happened_at)} · ${esc(e.author_name)}</span>${e.body?`<div class="small" style="white-space:pre-wrap;margin-top:4px;color:var(--soft)">${esc(e.body)}</div>`:''}</div>
            ${e.kind!=='sistema'?`<button class="icon-btn" data-del="${e.id}" title="Apagar"><i data-lucide="trash-2"></i></button>`:''}</div>`).join('')||'<div class="empty"><i data-lucide="history"></i><div>Nada por aqui.</div></div>'}</div>`;
        PF.icons();
        const fk=p.querySelector('#fk');fk.value=filtro;fk.onchange=()=>{filtro=fk.value;draw();};
        p.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{if(confirm('Apagar este registro?'))post({action:'event_delete',id:b.dataset.del},'Apagado.');});
        p.querySelector('#addEv').onclick=()=>{
          const now=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
          const m=PF.modal(`<div class="modal-head"><h3>Registrar no histórico</h3><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
            <form class="stack" id="f">
              <div class="grid g2"><label class="field"><span>Tipo</span><select class="select-in" name="kind"><option value="contato">Contato (ligação, WhatsApp, email)</option><option value="reuniao">Reunião</option><option value="nota">Anotação</option></select></label>
              <label class="field"><span>Quando</span><input class="input" type="datetime-local" name="happened_at" value="${now}"></label></div>
              <label class="field"><span>Título</span><input class="input" name="title" required placeholder="Ex.: Ligação sobre a campanha de novembro"></label>
              <label class="field"><span>Detalhes</span><textarea class="input" name="body" placeholder="O que foi conversado, combinados, próximos passos…"></textarea></label>
              <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Salvar</button></div></form>`);
          m.el.querySelector('#f').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));d.happened_at=d.happened_at?new Date(d.happened_at).toISOString():'';m.close();await post({action:'event',...d},'Registrado no histórico.');};
        };
      };
      draw();
    }

    async function cofre(p){
      p.innerHTML='<div class="card empty"><i data-lucide="loader"></i><div>Abrindo o cofre…</div></div>';PF.icons();
      let items=[];
      try{items=(await PF.api('/api/clients/vault?client='+encodeURIComponent(id))).items;}catch(e){p.innerHTML=`<div class="card empty"><i data-lucide="lock"></i><div>${esc(e.message)}</div></div>`;PF.icons();return;}
      const ST={liberado:['Liberado','solid-green'],pendente:['Pendente','solid-amber'],revogado:['Revogado','gray']};
      p.innerHTML=`<div class="card"><div class="card-head"><div><h3><i data-lucide="lock" style="width:17px;vertical-align:-3px;color:var(--orange)"></i> Cofre de senhas</h3><p>As senhas ficam criptografadas. Cada visualização fica registrada no histórico.</p></div><button class="btn btn-primary btn-sm" id="addV"><i data-lucide="plus"></i>Adicionar acesso</button></div>
        ${items.length?`<div class="table-wrap"><table class="tbl"><thead><tr><th>Plataforma</th><th>Login</th><th>Senha</th><th>Tipo</th><th>Status</th><th>Atualizado</th><th></th></tr></thead><tbody>
        ${items.map(v=>`<tr><td><b>${esc(v.platform)}</b>${v.url?`<div><a class="link tiny" href="${esc(v.url)}" target="_blank" rel="noopener">abrir</a></div>`:''}</td><td>${esc(v.login||'—')}</td>
          <td>${v.has_secret?`<span class="row" style="gap:6px"><code data-sec="${v.id}">••••••••</code><button class="icon-btn" data-show="${v.id}" title="Ver senha"><i data-lucide="eye"></i></button></span>`:'<span class="muted">—</span>'}</td>
          <td>${esc(v.access_type||'—')}</td><td>${PF.badge(...(ST[v.status]||ST.liberado))}</td><td class="tiny muted">${esc(v.updated_by)}<br>${fdt(v.updated_at)}</td>
          <td class="right nowrap"><button class="icon-btn" data-ed="${v.id}" title="Editar"><i data-lucide="pencil"></i></button><button class="icon-btn" data-rm="${v.id}" title="Remover"><i data-lucide="trash-2"></i></button></td></tr>`).join('')}
        </tbody></table></div>`:'<div class="empty"><i data-lucide="key-round"></i><div>Nenhum acesso cadastrado.</div></div>'}</div>`;
      PF.icons();
      const form=v=>{v=v||{};const m=PF.modal(`<div class="modal-head"><h3>${v.id?'Editar acesso':'Novo acesso'}</h3><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
        <form class="stack" id="f"><div class="grid g2"><label class="field"><span>Plataforma</span><input class="input" name="platform" required value="${esc(v.platform||'')}" placeholder="Instagram, Meta Business, Google Ads…"></label>
          <label class="field"><span>Tipo de acesso</span><input class="input" name="access_type" value="${esc(v.access_type||'')}" placeholder="Administrador, Editor…"></label></div>
          <div class="grid g2"><label class="field"><span>Login / usuário</span><input class="input" name="login" value="${esc(v.login||'')}" autocomplete="off"></label>
          <label class="field"><span>Senha ${v.id?'<small class="muted">(em branco = manter)</small>':''}</span><input class="input" type="password" name="secret" autocomplete="new-password"></label></div>
          <div class="grid g2"><label class="field"><span>Link de acesso</span><input class="input" name="url" value="${esc(v.url||'')}" placeholder="https://"></label>
          <label class="field"><span>Status</span><select class="select-in" name="status">${Object.entries(ST).map(([k,l])=>`<option value="${k}" ${v.status===k?'selected':''}>${l[0]}</option>`).join('')}</select></label></div>
          <label class="field"><span>Observações</span><textarea class="input" name="notes" style="min-height:60px">${esc(v.notes||'')}</textarea></label>
          <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Salvar</button></div></form>`);
        m.el.querySelector('#f').onsubmit=async e=>{e.preventDefault();try{await PF.api('/api/clients/vault',{method:'POST',body:{action:'save',client_id:id,id:v.id,...Object.fromEntries(new FormData(e.target))}});m.close();PF.toast('Acesso salvo.','ok');cofre(p);}catch(x){PF.toast(x.message,'err');}};};
      p.querySelector('#addV').onclick=()=>form(null);
      p.querySelectorAll('[data-ed]').forEach(b=>b.onclick=()=>form(items.find(i=>i.id===b.dataset.ed)));
      p.querySelectorAll('[data-rm]').forEach(b=>b.onclick=async()=>{if(!confirm('Remover este acesso do cofre?'))return;try{await PF.api('/api/clients/vault',{method:'POST',body:{action:'delete',id:b.dataset.rm}});cofre(p);}catch(x){PF.toast(x.message,'err');}});
      p.querySelectorAll('[data-show]').forEach(b=>b.onclick=async()=>{try{const r=await PF.api('/api/clients/vault',{method:'POST',body:{action:'reveal',id:b.dataset.show}});const el=p.querySelector(`[data-sec="${b.dataset.show}"]`);el.textContent=r.secret||'(vazia)';setTimeout(()=>{el.textContent='••••••••';},20000);}catch(x){PF.toast(x.message,'err');}});
    }

    function editar(){
      const c=D.client;
      const m=PF.modal(`<div class="modal-head"><h3>Editar cadastro</h3><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
        <form class="stack" id="f">
          <label class="field"><span>Nome do cliente</span><input class="input" name="name" required value="${esc(c.name)}"></label>
          <div class="grid g2"><label class="field"><span>Segmento</span><input class="input" name="segment" value="${esc(c.segment||'')}"></label>
            <label class="field"><span>Situação</span><select class="select-in" name="status">${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${c.status===k?'selected':''}>${v[0]}</option>`).join('')}</select></label></div>
          <label class="field"><span>Serviços contratados (separados por vírgula)</span><input class="input" name="services" value="${esc(c.services||'')}"></label>
          <div class="grid g3"><label class="field"><span>Contato do cliente</span><input class="input" name="contact_name" value="${esc(c.contact_name||'')}"></label>
            <label class="field"><span>WhatsApp</span><input class="input" name="phone" value="${esc(c.phone||'')}"></label>
            <label class="field"><span>E-mail</span><input class="input" type="email" name="email" value="${esc(c.email||'')}"></label></div>
          <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Salvar</button></div></form>`);
      m.el.querySelector('#f').onsubmit=async e=>{e.preventDefault();try{await PF.api('/api/clients',{method:'PATCH',body:{id,...Object.fromEntries(new FormData(e.target))}});m.close();PF.toast('Cadastro salvo.','ok');load();}catch(x){PF.toast(x.message,'err');}};
    }

    async function iniciar(){
      if(!confirm(`Iniciar o onboarding de ${D.client.name}?\n\nO prazo é de 10 dias úteis a partir de hoje.`))return;
      try{const r=await PF.api('/api/onboarding',{method:'POST',body:{client_id:id}});location.href='onboarding.html?id='+r.id;}catch(e){PF.toast(e.message,'err');}
    }
    load();
  };
})();
