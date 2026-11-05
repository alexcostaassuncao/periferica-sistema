/* Área de tarefas compartilhada: Copy, Design e Revisão da consultora (PDF págs. 14, 15 e 16).
   Uso: PF.tasks({role:'copy'|'design'|'revisao'}) */
(function(){
  const CLIENTS={'Clínica Vida+':'CV','Real Pedras':'RP','Mercado Doce':'MD','Elegance Cortinas':'EL','DZAM Uniformes':'DZ','Pet Love':'PL','Solaris Tech':'ST','Bella Forma':'BF'};
  const TYPE={'Social media':'blue','Campanha':'pink'};
  const BASE=[
    ['Post – Dicas de skincare no verão','Clínica Vida+','Social media','12/10','hoje'],
    ['Campanha – Lançamento Linha Premium','Real Pedras','Campanha','12/10','hoje'],
    ['Post – Bastidores da clínica','Clínica Vida+','Social media','12/10','hoje'],
    ['Post – Promoção da semana','Mercado Doce','Social media','12/10','hoje'],
    ['Post – Ambientes integrados','Elegance Cortinas','Social media','13/10','amanha'],
    ['Campanha – Rejuvenescimento','Clínica Vida+','Campanha','13/10','amanha'],
    ['Post – Uniformes personalizados','DZAM Uniformes','Social media','14/10','amanha'],
    ['Post – Rotina de cuidados','Clínica Vida+','Social media','15/10','prox'],
    ['Campanha – Black November','Bella Forma','Campanha','16/10','prox'],
    ['Post – Depoimento de paciente','Clínica Vida+','Social media','16/10','prox'],
  ];
  const CFG={
    copy:{title:'Minhas tarefas',sub:'Acompanhe e execute suas demandas de copy.',
      kpis:[['clipboard-list','orange','12','Total de tarefas'],['loader','blue','4','Em andamento'],['clock','purple','6','Pendentes'],['calendar','green','8','Próximas demandas']],
      tabs:['Todas (12)','Em andamento (4)','Pendentes (6)','Concluídas (2)','Próximas (8)'],
      status:[['Em produção','blue'],['Pendente','gray'],['Hoje','pink']],
      main:['Entregar para design','arrow-right'],second:null,tip:'Foco no que importa. Conteúdo que gera resultado.'},
    design:{title:'Minhas tarefas',sub:'Acompanhe e execute suas demandas de design.',
      kpis:[['clipboard-list','orange','12','Total de tarefas'],['palette','blue','6','Em produção'],['clock','purple','3','Aguardando aprovação'],['calendar','green','8','Próximas no pipeline']],
      tabs:['Minhas tarefas (12)','Para ajudar (4)','Aguardando liberação (6)','Concluídas (32)','Todas (54)'],
      status:[['Em produção','blue'],['Aguardando distribuição','yellow'],['Ajustes','pink']],
      main:['Entregar para aprovação','send'],second:['Marcar como concluída','check'],tip:'Trabalho em equipe e mais agilidade nas entregas.'},
    revisao:{title:'Tarefas para minha revisão',sub:'Confira e envie as demandas para aprovação do cliente.',
      kpis:[['eye','orange','18','Para minha revisão'],['send','blue','6','Aguardando cliente'],['clock','purple','4','Ajustes do cliente'],['circle-check','green','12','Aprovadas (este mês)'],['calendar-days','blue','8','Próximas entregas']],
      tabs:['Para minha revisão (18)','Retorno do cliente (6)','Aprovadas (12)'],
      status:[['Aguardando sua revisão','yellow'],['Revisão sugerida','purple']],
      main:['Enviar para aprovação do cliente','send'],second:['Solicitar ajustes','rotate-ccw'],tip:''},
  };

  PF.tasks=function({role}){
    const cfg=CFG[role];
    const content=PF.shell({title:cfg.title,subtitle:cfg.sub,crumbs:[['Operação'],[role==='revisao'?'Revisão':role==='copy'?'Copy':'Design']],search:'Buscar tarefa, cliente...',
      actions:role==='design'?`<button class="btn btn-primary"><i data-lucide="plus"></i>Nova tarefa</button>`:''});
    const tasks=BASE.map((t,i)=>({id:i,title:t[0],client:t[1],type:t[2],due:t[3],group:t[4],status:cfg.status[i%cfg.status.length],done:false}));
    let sel=0,tab=0;
    const thumb=t=>`<span class="tthumb" style="background:linear-gradient(135deg,${PF.colorOf(t.client)}66,${PF.colorOf(t.title)}33)"><i data-lucide="${t.type==='Campanha'?'megaphone':'image'}"></i></span>`;

    function row(t){return `<tr class="${t.id===sel?'hl':''}" data-id="${t.id}"><td><input type="checkbox" class="chk" ${t.done?'checked':''} data-done="${t.id}"></td>
      <td><div class="who">${thumb(t)}<b class="small" style="${t.done?'text-decoration:line-through;color:var(--dim)':''}">${t.title}</b></div></td>
      <td><div class="row small"><span class="logo-chip" style="width:26px;height:26px;font-size:10px;background:${PF.colorOf(t.client)}">${CLIENTS[t.client]}</span>${t.client}</div></td>
      <td>${PF.badge(t.type,TYPE[t.type])}</td><td class="small">${t.due}</td><td>${PF.badge(...t.status)}</td></tr>`;}

    function group(key,label){const g=tasks.filter(t=>t.group===key);return `<tr class="grp-row"><td colspan="6"><b>${label}</b> <span class="count-pill">${g.length}</span></td></tr>${g.map(row).join('')}`;}

    function panel(t){
      const flow=[['Copy','Concluída','10/10 14:32'],['Design','Concluída','11/10 09:15'],['Sua revisão','Aguardando',''],['Cliente','Pendente',''],[t.type==='Campanha'?'Tráfego':'Publicação','Pendente','']];
      const now=role==='copy'?0:role==='design'?1:2;
      return `<div class="row between" style="margin-bottom:12px"><div class="row"><span class="logo-chip" style="background:${PF.colorOf(t.client)}">${CLIENTS[t.client]}</span><div><b>${t.client}</b><div class="muted tiny">${t.type} · ${t.title}</div></div></div>
        <div class="row" style="gap:2px"><button class="icon-btn" data-nav="-1" aria-label="Anterior"><i data-lucide="chevron-left"></i></button><button class="icon-btn" data-nav="1" aria-label="Próxima"><i data-lucide="chevron-right"></i></button></div></div>
      <div class="tabs" data-tabs><button data-tab="a" class="on">${role==='revisao'?'Prévia':'Detalhes'}</button><button data-tab="b">Briefing</button><button data-tab="c">Comentários (2)</button><button data-tab="d">Histórico</button></div>
      <section data-pane="a">
        ${role==='revisao'?`<div class="preview-grid"><div class="mock" style="background:linear-gradient(160deg,#f3d9c7,#c99677)"><span>Cuidados com a pele no verão</span><small>CONFIRA AS DICAS →</small></div>
          <div class="small"><div class="row between"><b>Legenda sugerida</b><button class="icon-btn" title="Copiar"><i data-lucide="copy"></i></button></div><p class="muted" style="line-height:1.55;margin-top:6px">O verão pede uma atenção especial com a pele! ☀️ Separamos algumas dicas simples para manter sua pele saudável, protegida e radiante nessa estação. Arraste para o lado e confira! →</p>
          <div class="file-line"><i data-lucide="file-image"></i><div>post-skincare.jpg<small>1080 × 1350 px · 2,4 MB</small></div></div></div></div>`:
        `<div class="grid g3 small mb"><div><span class="muted tiny">Prazo</span><div>${t.due}/2026</div></div><div><span class="muted tiny">Status</span><div>${PF.badge(...t.status)}</div></div><div><span class="muted tiny">Prioridade</span><div style="color:var(--pink);font-weight:600">Alta</div></div></div>
        <div class="field mb"><span>Descrição</span><p class="small muted" style="line-height:1.55">Post educativo com dicas de skincare no verão, com foco em prevenção de manchas e cuidados básicos.</p></div>
        <div class="field mb"><span>Direcionamento da consultora</span><ul class="small muted" style="padding-left:18px;line-height:1.7"><li>Tom de voz: leve e acessível</li><li>Público: mulheres de 25 a 45 anos</li><li>Objetivo: engajamento e autoridade</li><li>Referências: ver pasta no Drive</li></ul></div>
        <div class="field"><span>Arquivos de apoio</span><div class="row wrap">${['referencias.pdf','fotos-cliente.zip','exemplo-post.jpg'].map(f=>`<span class="file-chip"><i data-lucide="${f.endsWith('.pdf')?'file-text':'image'}"></i>${f}</span>`).join('')}<button class="file-chip add"><i data-lucide="plus"></i></button></div></div>`}
        <div class="card flat" style="margin-top:14px"><div class="row between small" style="margin-bottom:10px"><b>Fluxo da tarefa</b><a class="link tiny" href="#">Ver histórico</a></div>
          <div class="timeline">${flow.map(([n,s,d],i)=>`<div class="tl ${i<now?'done':i===now?'now':''}"><i>${i<now?'<svg class="lucide" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5"/></svg>':''}</i><b>${n}</b><small>${i<now?'Concluída':i===now?'Aguardando':'Pendente'}${i<now&&d?'<br>'+d:''}</small></div>`).join('')}</div></div>
      </section>
      <section data-pane="b" hidden class="small muted" style="line-height:1.6">Briefing completo da demanda, criado a partir da ata da reunião mensal com o cliente.</section>
      <section data-pane="c" hidden class="stack small"><div class="li">${PF.avatar('Juliana Ferreira')}<div class="t"><b>Juliana Ferreira</b><span>Caprichar na primeira lâmina, é o gancho.</span></div></div><textarea class="input" placeholder="Escreva um comentário…" style="min-height:64px"></textarea></section>
      <section data-pane="d" hidden class="small muted">Criada em 08/10 a partir da reunião mensal.</section>
      <div class="grid ${cfg.second?'g2':''}" style="margin-top:14px">${cfg.second?`<button class="btn btn-outline" data-act="second"><i data-lucide="${cfg.second[1]}"></i>${cfg.second[0]}</button>`:''}<button class="btn btn-primary" data-act="main"><i data-lucide="${cfg.main[1]}"></i>${cfg.main[0]}</button></div>`;
    }

    function render(){
      const t=tasks.find(x=>x.id===sel);
      content.innerHTML=`
      <section class="grid ${cfg.kpis.length===5?'g5':'g4'} mb">${cfg.kpis.map(([i,c,v,l],k)=>PF.kpi({icon:i,color:c,value:v,label:l,click:String(k),active:k===0})).join('')}</section>
      <div class="split">
        <div class="card">
          <div class="tabs">${cfg.tabs.map((l,i)=>`<button class="${i===tab?'on':''}" data-t="${i}">${l}</button>`).join('')}</div>
          <div class="filters">${PF.select('c','Cliente',['Cliente: Todos',...Object.keys(CLIENTS)])}${PF.select('ty','Tipo',['Tipo: Todos','Social media','Campanha'])}${PF.select('p','Prazo',['Prazo: Todos','Hoje','Esta semana'])}<span style="margin-left:auto">${PF.demo()}</span></div>
          <div class="table-wrap"><table class="tbl"><thead><tr><th style="width:30px"></th><th>Tarefa</th><th>Cliente</th><th>Tipo</th><th>Prazo</th><th>Status</th></tr></thead><tbody>
            ${group('hoje','Hoje')}${group('amanha','Amanhã')}${group('prox','Próximas')}</tbody></table></div>
          ${cfg.tip?`<div class="note info" style="margin-top:14px"><i data-lucide="lightbulb"></i><div class="small">${cfg.tip}</div></div>`:''}
        </div>
        <aside class="card panel">${panel(t)}</aside>
      </div>`;
      PF.icons();PF.tabs(content);
      content.querySelectorAll('tr[data-id]').forEach(tr=>tr.onclick=e=>{if(e.target.matches('.chk'))return;sel=+tr.dataset.id;render();});
      content.querySelectorAll('[data-done]').forEach(c=>c.onchange=()=>{tasks[+c.dataset.done].done=c.checked;render();});
      content.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=+b.dataset.t;render();});
      content.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{sel=(sel+ +b.dataset.nav+tasks.length)%tasks.length;render();});
      content.querySelector('[data-act="main"]').onclick=()=>{t.done=true;PF.toast(role==='copy'?'Tarefa entregue para o design.':role==='design'?'Enviada para aprovação da consultora.':'Enviada para aprovação do cliente.','ok');sel=(sel+1)%tasks.length;render();};
      const s=content.querySelector('[data-act="second"]');if(s)s.onclick=()=>{
        if(role==='revisao'){const why=prompt('O que precisa ajustar?');if(!why)return;PF.toast('Ajustes solicitados.','ok');}else{t.done=true;PF.toast('Tarefa concluída.','ok');}render();};
    }
    render();
  };
})();
