/* Telas de Copy, Design e Revisão — mesmas tarefas da Gestão, filtradas pela etapa.
   PF.tasks({role:'copy'|'design'|'revisao'}) */
(function(){
  const CFG={
    copy:{title:'Copy',sub:'Briefing, texto da arte e legenda. Salve e envie para o Design.',
      tabs:[['fazer','Para fazer',['copy']],['enviadas','Já enviadas',['design','revisao','cliente']],['aprovadas','Aprovadas',['aprovada']]]},
    design:{title:'Design',sub:'Veja o briefing, anexe a arte ou o vídeo e envie para a Revisão.',
      tabs:[['fazer','Para fazer',['design']],['enviadas','Na revisão / cliente',['revisao','cliente']],['aprovadas','Aprovadas',['aprovada']]]},
    revisao:{title:'Revisão',sub:'Confira a entrega com a legenda, peça ajustes ou libere para o cliente.',
      tabs:[['fazer','Para revisar',['revisao']],['cliente','Com o cliente',['cliente']],['aprovadas','Aprovadas',['aprovada']],['producao','Em produção',['gestao','copy','design']]]},
  };
  PF.tasks=function({role}){
    const cfg=CFG[role],esc=PF.esc;
    const content=PF.shell({title:cfg.title,subtitle:cfg.sub,crumbs:[['Operação'],[cfg.title]],search:'Buscar tarefa ou cliente...'});
    let all=[],tab='fazer',f={client:'',squad:'',category:'',due:'',mine:false,q:''};
    const hoje=new Date().toISOString().slice(0,10),semana=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    async function load(){try{all=(await PF.api('/api/tasks')).tasks;}catch(e){PF.toast(e.message,'err');}render();}
    const stagesOf=k=>cfg.tabs.find(t=>t[0]===k)[2];
    const passa=t=>(!f.client||t.client_id===f.client)&&(!f.squad||t.squad===f.squad)&&(!f.category||t.category===f.category)&&(!f.mine||t.assignee_id===PF.user.id||t.responsible_id===PF.user.id)
      &&(!f.q||(t.title+' '+t.client_name).toLowerCase().includes(f.q))
      &&(!f.due||(f.due==='atrasadas'?t.due_date&&t.due_date<hoje&&t.stage!=='aprovada':f.due==='hoje'?t.due_date===hoje:t.due_date>=hoje&&t.due_date<=semana));
    function render(){
      const {CAT,FMT}=PF.taskMeta;
      const filtered=all.filter(passa);
      const list=filtered.filter(t=>stagesOf(tab).includes(t.stage));
      const n=k=>filtered.filter(t=>stagesOf(k).includes(t.stage)).length;
      const fazer=filtered.filter(t=>stagesOf('fazer').includes(t.stage));
      const grupos=[['Atrasadas',t=>t.due_date&&t.due_date<hoje],['Hoje',t=>t.due_date===hoje],['Próximos dias',t=>t.due_date>hoje],['Sem prazo',t=>!t.due_date]];
      const clients=[...new Map(all.map(t=>[t.client_id,t.client_name])).entries()];
      content.innerHTML=`
      <section class="grid g4 mb">
        ${PF.kpi({icon:'inbox',color:'orange',value:String(fazer.length),label:cfg.tabs[0][1],click:'fazer',active:tab==='fazer'})}
        ${PF.kpi({icon:'alarm-clock',color:'pink',value:String(fazer.filter(t=>t.due_date&&t.due_date<hoje).length),label:'Atrasadas'})}
        ${PF.kpi({icon:'rotate-ccw',color:'yellow',value:String(fazer.filter(t=>t.last_adjust||t.client_status==='ajustes').length),label:'Voltaram com ajustes'})}
        ${PF.kpi({icon:'circle-check',color:'green',value:String(n('aprovadas')),label:'Aprovadas',click:'aprovadas',active:tab==='aprovadas'})}
      </section>
      <div class="card">
        <div class="tabs">${cfg.tabs.map(([k,l])=>`<button class="${tab===k?'on':''}" data-t="${k}">${l}<span class="count">${n(k)}</span></button>`).join('')}</div>
        <div class="filters">
          ${PF.select('fc','Cliente',[['','Cliente: todos'],...clients])}
          ${PF.select('fs','Carteira',[['','Carteira: todas'],['C1','C1'],['C2','C2'],['C3','C3']])}
          ${PF.select('fk','Categoria',[['','Categoria: todas'],...Object.entries(CAT)])}
          ${PF.select('fd','Prazo',[['','Prazo: todos'],['atrasadas','Atrasadas'],['hoje','Hoje'],['semana','Próximos 7 dias']])}
          <label class="row small"><input type="checkbox" class="chk" id="fm" ${f.mine?'checked':''}>Só as minhas</label>
          <a class="link" href="#" id="clr">Limpar filtros</a><span class="muted small" style="margin-left:auto">${list.length} tarefa(s)</span>
        </div>
        ${list.length?`<div class="table-wrap"><table class="tbl"><thead><tr><th>Tarefa</th><th>Cliente</th><th>Etapa</th><th>Com</th><th>Tipo</th><th>Prazo</th><th></th></tr></thead><tbody>
          ${grupos.map(([g,fn])=>{const it=list.filter(fn);return it.length?`<tr class="grp-row"><td colspan="7"><b>${g}</b> <span class="count-pill">${it.length}</span></td></tr>`+it.map(t=>`<tr data-open="${t.id}" style="cursor:pointer">
            <td><div class="who">${t.last_url?(t.last_kind==='video'?'<span class="tthumb" style="background:var(--panel-3)"><i data-lucide="film"></i></span>':`<img class="tthumb" src="${esc(t.last_url)}" alt="" style="object-fit:cover">`):'<span class="tthumb" style="background:var(--panel-3)"><i data-lucide="file"></i></span>'}
              <div><b class="small">${esc(t.title)}</b>${t.last_adjust&&tab==='fazer'?`<small style="color:var(--pink);display:block">Ajuste: ${esc(t.last_adjust.slice(0,60))}</small>`:t.client_status==='ajustes'?'<small style="color:var(--pink);display:block">Cliente pediu ajustes</small>':''}</div></div></td>
            <td class="small">${esc(t.client_name)}${t.squad?` <span class="muted">· ${t.squad}</span>`:''}</td><td>${PF.taskStage(t.stage)}</td><td class="small">${esc(t.assignee_name||'—')}</td>
            <td class="small">${CAT[t.category]} · ${FMT[t.format]}</td><td class="small" style="color:${t.due_date&&t.due_date<hoje&&t.stage!=='aprovada'?'var(--pink)':'inherit'}">${t.due_date?t.due_date.split('-').reverse().join('/'):'—'}</td>
            <td class="right"><button class="btn btn-ghost btn-sm">Abrir</button></td></tr>`).join(''):'';}).join('')}
        </tbody></table></div>`:`<div class="empty"><i data-lucide="check-circle"></i><div>Nenhuma tarefa aqui com esses filtros.</div></div>`}
      </div>`;
      PF.icons();
      content.querySelectorAll('[data-t],[data-kpi]').forEach(b=>b.onclick=()=>{tab=b.dataset.t||b.dataset.kpi;render();});
      const bind=(i,k)=>{const s=content.querySelector('#'+i);s.value=f[k];s.onchange=()=>{f[k]=s.value;render();};};
      bind('fc','client');bind('fs','squad');bind('fk','category');bind('fd','due');
      content.querySelector('#fm').onchange=e=>{f.mine=e.target.checked;render();};
      content.querySelector('#clr').onclick=e=>{e.preventDefault();f={client:'',squad:'',category:'',due:'',mine:false,q:''};document.getElementById('globalSearch').value='';render();};
      content.querySelectorAll('[data-open]').forEach(tr=>tr.onclick=()=>PF.Tarefa.open(tr.dataset.open,{onChange:load}));
    }
    document.getElementById('globalSearch').oninput=e=>{f.q=e.target.value.toLowerCase();render();};
    render();load();
    // Abrir uma tarefa direto pelo link (?tarefa=ID)
    const direct=new URLSearchParams(location.search).get('tarefa');if(direct)PF.Tarefa.open(direct,{onChange:load});
  };
})();
