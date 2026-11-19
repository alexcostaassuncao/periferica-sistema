/* =========================================================
   Periférica — estrutura comum das telas (menu, topo, utilidades)
   Cada página chama PF.shell({...}) e depois preenche #content.
   ========================================================= */
(function(){
  const MENU=[
    {href:'inicio.html',icon:'home',label:'Início'},
    {group:'Clientes',icon:'users',items:[
      {area:'comercial',href:'comercial.html',icon:'user-round-search',label:'Comercial'},
      {area:'contratos',href:'contratos.html',icon:'file-signature',label:'Contratos'},
      {area:'clientes',href:'clientes.html',icon:'contact',label:'Clientes'},
    ]},
    {group:'Operação',icon:'layout-grid',items:[
      {area:'onboarding',href:'onboarding.html',icon:'square-check-big',label:'Onboarding'},
      {area:'gestao',href:'gestao.html',icon:'square-kanban',label:'Gestão'},
      {area:'revisao',href:'revisao.html',icon:'eye',label:'Revisão'},
      {area:'copy',href:'copy.html',icon:'pen-line',label:'Copy'},
      {area:'design',href:'design.html',icon:'palette',label:'Design'},
      {area:'publicacoes',href:'publicacoes.html',icon:'send',label:'Publicações'},
      {area:'trafego',href:'trafego.html',icon:'bar-chart-3',label:'Tráfego'},
      {area:'projetos',href:'projetos.html',icon:'folder-kanban',label:'Projetos'},
    ]},
    {group:'Financeiro · Direção',icon:'chart-no-axes-column',items:[
      {area:'financeiro',href:'financeiro.html',icon:'receipt-text',label:'Controle de contratos'},
      {area:'financeiro',href:'financeiro.html#renovacoes',icon:'clock',label:'Renovações'},
      {area:'financeiro',href:'financeiro.html#cancelamentos',icon:'folder-x',label:'Cancelamentos'},
      {area:'financeiro',href:'financeiro.html#squads',icon:'chart-column',label:'Rentabilidade por squad'},
    ]},
    {group:'Equipe',icon:'users-round',items:[
      {area:'equipe',href:'equipe.html',icon:'user-cog',label:'Usuários'},
      {href:'variavel.html',icon:'chart-column-increasing',label:'Meu Variável'},
    ]},
    {area:'agenda',href:'agenda.html',icon:'calendar-days',label:'Agenda'},
    {group:'Configurações',icon:'settings',items:[
      {area:'configuracoes',href:'configuracoes.html',icon:'share-2',label:'Redes sociais'},
      {area:'configuracoes',href:'portal.html',icon:'monitor-smartphone',label:'Portal do cliente'},
    ]},
  ];

  const page=location.pathname.split('/').pop()||'inicio.html';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  const PALETTE=['#ff580b','#8b5cf6','#1e90ff','#1fd59a','#f43f5e','#f6b51e','#14b8a6','#ec4899','#64748b','#0ea5e9'];
  const colorOf=s=>{let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))>>>0;return PALETTE[h%PALETTE.length];};

  // areas: lista de áreas liberadas (null = ainda não sabemos; mostra só o Início).
  const allowed=(i,areas)=>!i.area||areas===true||(Array.isArray(areas)&&areas.includes(i.area));
  function nav(areas){
    return MENU.map(m=>m.group?{...m,items:m.items.filter(i=>allowed(i,areas))}:m).filter(m=>m.group?m.items.length:allowed(m,areas)).map(m=>{
      if(!m.group)return `<a href="${m.href}" class="${m.href===page?'active':''}"><i data-lucide="${m.icon}"></i>${m.label}</a>`;
      const open=m.items.some(i=>i.href.split('#')[0]===page);
      return `<div class="group ${open?'open':''}">
        <button class="grp" type="button"><i data-lucide="${m.icon}"></i>${m.group}<i data-lucide="chevron-down" class="chev"></i></button>
        <div class="sub">${m.items.map(i=>`<a href="${i.href}" class="${i.href===page?'active':''}"><i data-lucide="${i.icon}"></i>${i.label}</a>`).join('')}</div>
      </div>`;
    }).join('');
  }

  const PF={esc,initials,colorOf,user:{name:'',role:''}};
  const cached=()=>{try{return JSON.parse(sessionStorage.getItem('pf-areas')||'null');}catch{return null;}};
  function bindNav(){document.querySelectorAll('#sidebar .grp').forEach(b=>b.onclick=()=>b.parentElement.classList.toggle('open'));}

  // Monta menu lateral + topo. opts: {title, subtitle, crumbs:[[label,href]], search, actions(html)}
  PF.shell=function(opts={}){
    document.title='Periférica · '+(opts.title||'');
    const body=document.body;
    body.innerHTML=`<div class="app">
      <aside class="sidebar" id="sidebar">
        <a class="logo" href="inicio.html">PERIFÉRICA</a>
        <nav class="nav" id="nav">${nav(cached())}</nav>
        <button class="user" type="button" id="userBtn" title="Sair">
          <div class="avatar" id="meAvatar"></div>
          <div><div class="name" id="meName"></div><div class="role" id="meRole"></div></div>
          <i data-lucide="chevron-right"></i>
        </button>
      </aside>
      <div class="scrim" id="scrim"></div>
      <main class="main">
        <button class="menu-btn" id="menuBtn" aria-label="Abrir menu"><i data-lucide="menu"></i></button>
        <header class="topbar">
          <div class="page-title">
            ${opts.crumbs?`<div class="crumbs">${opts.crumbs.map(([l,h],i)=>(i?'<i data-lucide="chevron-right"></i>':'')+(h?`<a href="${h}">${esc(l)}</a>`:`<span>${esc(l)}</span>`)).join('')}</div>`:''}
            <h1>${opts.titleHtml||esc(opts.title||'')}</h1>
            ${opts.subtitle?`<p>${esc(opts.subtitle)}</p>`:''}
          </div>
          <div class="top-right">
            ${opts.actions||''}
            ${opts.search===false?'':`<label class="search"><i data-lucide="search"></i><input id="globalSearch" placeholder="${esc(opts.search||'Buscar clientes, tarefas, campanhas...')}"></label>`}
            <button class="bell" id="bell" aria-label="Avisos" title="Avisos"><i data-lucide="bell"></i><span class="bell-n" id="bellN" hidden></span></button>
          </div>
        </header>
        <div id="content"></div>
      </main>
    </div>`;
    const sb=document.getElementById('sidebar'),scrim=document.getElementById('scrim');
    document.getElementById('menuBtn').onclick=()=>{sb.classList.add('open');scrim.classList.add('show');};
    scrim.onclick=()=>{sb.classList.remove('open');scrim.classList.remove('show');};
    bindNav();
    if(new URLSearchParams(location.search).has('sem-acesso'))setTimeout(()=>PF.toast('Você não tem acesso a essa área. Fale com a direção.','err'),300);
    document.getElementById('userBtn').onclick=async()=>{
      if(!confirm('Sair do sistema?'))return;
      try{sessionStorage.removeItem('pf-areas');}catch{}
      await fetch('/api/auth/logout',{method:'POST'}).catch(()=>{});location.href='login.html';
    };
    PF.loadMe();
    return document.getElementById('content');
  };

  PF.loadMe=async function(){
    try{
      const r=await fetch('/api/auth/me');if(!r.ok)return;
      const u=await r.json();PF.user={...PF.user,...u,role:u.access||(u.admin?'Administrador':'Equipe')};
      const areas=u.admin?true:(u.areas||[]);
      try{sessionStorage.setItem('pf-areas',JSON.stringify(areas));}catch{}
      document.getElementById('nav').innerHTML=nav(areas);bindNav();PF.icons();
      document.getElementById('meName').textContent=u.name.split(' ')[0];
      document.getElementById('meRole').textContent=PF.user.role;
      document.getElementById('meAvatar').textContent=initials(u.name);
      document.dispatchEvent(new CustomEvent('pf:me',{detail:PF.user}));
      // Modo desenvolvedor: só para Administrador e Desenvolvedor.
      if(u.admin||u.access==='Desenvolvedor'){const s=document.createElement('script');s.src='js/devmode.js?v=1';document.body.appendChild(s);}
      PF.loadAvisos();
    }catch{}
  };

  // ---------- painel de avisos (sininho) ----------
  let avisos=[];
  PF.loadAvisos=async function(){
    try{const r=await fetch('/api/avisos');if(!r.ok)return;const d=await r.json();avisos=d.avisos;
      const n=document.getElementById('bellN');if(n){n.hidden=!d.total;n.textContent=d.total>99?'99+':d.total;}
      const b=document.getElementById('bell');if(b){b.onclick=togglePanel;b.title=d.total?d.total+' aviso(s)':'Nenhum aviso';}
    }catch{}
  };
  function togglePanel(e){
    e&&e.stopPropagation();
    let p=document.getElementById('avisosPanel');
    if(p){p.remove();return;}
    p=document.createElement('div');p.id='avisosPanel';p.className='avisos';
    const al=avisos.filter(a=>a.level==='alerta'),inf=avisos.filter(a=>a.level==='info');
    const item=a=>`<${a.href?'a href="'+esc(a.href)+'"':'div'} class="av ${a.level}"><span class="ico sm ${a.level==='info'?'c-blue':'c-orange'}"><i data-lucide="${esc(a.icon)}"></i></span><div><b>${esc(a.title)}</b>${a.body?`<small>${esc(a.body)}</small>`:''}</div></${a.href?'a':'div'}>`;
    p.innerHTML=`<div class="av-head"><b>Avisos</b><button class="icon-btn" id="avClose" aria-label="Fechar"><i data-lucide="x"></i></button></div>
      <div class="av-list">${al.map(item).join('')||'<div class="av-empty"><i data-lucide="check-circle"></i>Tudo em dia. Nenhum aviso agora.</div>'}${inf.map(item).join('')}</div>`;
    document.body.appendChild(p);PF.icons();
    p.querySelector('#avClose').onclick=()=>p.remove();
    setTimeout(()=>document.addEventListener('click',function out(ev){if(!p.contains(ev.target)){p.remove();document.removeEventListener('click',out);}}),0);
  }

  PF.icons=()=>window.lucide&&lucide.createIcons();

  // ---------- chamadas à API ----------
  PF.api=async function(path,opts={}){
    const init={method:opts.method||'GET',headers:{}};
    if(opts.body!==undefined){init.headers['Content-Type']='application/json';init.body=JSON.stringify(opts.body);}
    const r=await fetch(path,init);
    const data=await r.json().catch(()=>({}));
    if(r.status===401){location.href='login.html?next='+encodeURIComponent(location.pathname+location.search);throw Error('Sessão expirada.');}
    if(!r.ok)throw Error(data.error||'Algo deu errado. Tente de novo.');
    return data;
  };

  // ---------- componentes ----------
  PF.toast=function(msg,kind=''){
    document.querySelectorAll('.toast').forEach(t=>t.remove());
    const t=document.createElement('div');t.className='toast '+kind;t.textContent=msg;document.body.appendChild(t);
    setTimeout(()=>t.remove(),kind==='err'?6000:3500);
  };
  PF.modal=function(html,{side=false,wide=false}={}){
    const o=document.createElement('div');o.className='overlay'+(side?' side':'');
    o.innerHTML=`<div class="modal ${wide?'wide':''}" role="dialog" aria-modal="true">${html}</div>`;
    const close=()=>{o.remove();document.removeEventListener('keydown',onKey);};
    const onKey=e=>{if(e.key==='Escape')close();};
    o.addEventListener('mousedown',e=>{if(e.target===o)close();});
    document.addEventListener('keydown',onKey);
    document.body.appendChild(o);
    o.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
    PF.icons();
    return {el:o.firstElementChild,close};
  };
  PF.avatar=(name,size='sm')=>`<span class="avatar ${size}" style="background:${colorOf(name)}" title="${esc(name)}">${esc(initials(name))}</span>`;
  PF.chip=(name,size='')=>`<span class="logo-chip ${size}" style="background:${colorOf(name)}">${esc(initials(name))}</span>`;
  PF.badge=(text,color='gray')=>`<span class="badge b-${color}">${esc(text)}</span>`;
  PF.kpi=k=>`<div class="card kpi fade ${k.click?'clickable':''} ${k.active?'active':''}" ${k.click?`data-kpi="${esc(k.click)}"`:''}>
      <div class="ico c-${k.color}"><i data-lucide="${k.icon}"></i></div>
      <div class="kpi-body">
        <div class="kpi-top"><span class="kpi-value">${esc(k.value)}</span>${k.delta?`<span class="delta ${k.deltaKind||'up'}">${esc(k.delta)}</span>`:''}</div>
        <div class="kpi-label">${esc(k.label)}</div>${k.sub?`<div class="kpi-sub">${esc(k.sub)}</div>`:''}
      </div>${k.arrow?'<i data-lucide="chevron-right" class="go"></i>':''}
    </div>`;
  PF.net=n=>n==='instagram'?'<span class="net"><i class="ig">IG</i>Instagram</span>':n==='facebook'?'<span class="net"><i class="fb">f</i>Facebook</span>':esc(n);
  PF.progress=p=>`<div class="progress"><div class="bar"><span style="width:${p}%"></span></div><span class="small">${p}%</span></div>`;
  PF.select=(id,label,options)=>`<select class="select-in" id="${id}" aria-label="${esc(label)}">${options.map(o=>Array.isArray(o)?`<option value="${esc(o[0])}">${esc(o[1])}</option>`:`<option>${esc(o)}</option>`).join('')}</select>`;
  PF.demo=()=>`<span class="demo-tag" title="Dados de exemplo do PDF. Serão ligados ao banco nas próximas etapas."><i data-lucide="flask-conical" style="width:13px;height:13px"></i>Dados de exemplo</span>`;

  // ---------- datas ----------
  PF.fmtDate=(ms,opts={day:'2-digit',month:'2-digit'})=>new Date(ms).toLocaleDateString('pt-BR',opts);
  PF.fmtTime=ms=>new Date(ms).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  PF.monthLabel=d=>{const m=d.toLocaleDateString('pt-BR',{month:'long'});return m[0].toUpperCase()+m.slice(1)+'/'+d.getFullYear();};
  PF.today=()=>{const s=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});return s[0].toUpperCase()+s.slice(1);};
  PF.brl=v=>'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:Number(v)%1?2:0,maximumFractionDigits:2});

  // Tabs simples: <div class="tabs" data-tabs> <button data-tab="x">…  +  <section data-pane="x">
  PF.tabs=function(root=document){
    root.querySelectorAll('[data-tabs]').forEach(bar=>{
      const scope=bar.parentElement;
      bar.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
        bar.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on',x===b));
        scope.querySelectorAll(':scope > [data-pane]').forEach(p=>p.hidden=p.dataset.pane!==b.dataset.tab);
        bar.dispatchEvent(new CustomEvent('tab',{detail:b.dataset.tab}));
      });
    });
  };

  // Kanban com arrastar e soltar. onMove(cardId, colId)
  PF.kanban=function(root,onMove){
    let dragged=null;
    root.querySelectorAll('.kcard').forEach(c=>{
      c.draggable=true;
      c.ondragstart=()=>{dragged=c;c.classList.add('dragging');};
      c.ondragend=()=>{c.classList.remove('dragging');dragged=null;};
    });
    root.querySelectorAll('.col').forEach(col=>{
      col.ondragover=e=>{e.preventDefault();col.classList.add('drop');};
      col.ondragleave=()=>col.classList.remove('drop');
      col.ondrop=e=>{e.preventDefault();col.classList.remove('drop');if(!dragged)return;col.appendChild(dragged);
        root.querySelectorAll('.col').forEach(k=>{const n=k.querySelector('.n');if(n)n.textContent=k.querySelectorAll('.kcard').length;});
        onMove&&onMove(dragged.dataset.id,col.dataset.col);};
    });
  };

  PF.animateBars=()=>requestAnimationFrame(()=>setTimeout(()=>document.querySelectorAll('.bar span[data-w]').forEach(b=>b.style.width=b.dataset.w+'%'),120));

  // ícone da aba
  if(!document.querySelector('link[rel=icon]')){const l=document.createElement('link');l.rel='icon';l.href='favicon.svg';document.head.appendChild(l);}
  window.PF=PF;
})();
