/* Painel da TAREFA — o mesmo registro em Gestão, Copy, Design e Revisão.
   PF.Tarefa.open(id,{onChange})        abre o painel (mostra só o que a pessoa pode fazer nesta etapa)
   PF.Tarefa.nova({client_id,meeting_id,onDone})   formulário de nova tarefa (Gestão)
   PF.upload(file,purpose)              envia para o Cloudinary (ou embute imagem pequena, se não houver) */
(function(){
  const esc=PF.esc;
  const STAGES=[['gestao','Gestão'],['copy','Copy'],['design','Design'],['revisao','Revisão'],['cliente','Cliente'],['aprovada','Aprovada']];
  const SCOLOR={gestao:'gray',copy:'purple',design:'blue',revisao:'yellow',cliente:'orange',aprovada:'green'};
  const CAT={social:'Social media',campanha:'Campanha'},FMT={feed:'Feed',stories:'Stories',reels:'Reels'},CH={instagram:'Instagram',facebook:'Facebook',ambos:'Instagram + Facebook'};
  const ACT={criada:'Criou a tarefa',enviada:'Enviou',ajuste:'Pediu ajuste',versao:'Anexou entrega',liberada:'Liberou para o cliente',aprovada:'Aprovada',cliente_ajustes:'Cliente pediu ajustes'};
  PF.taskStage=(s)=>PF.badge((STAGES.find(x=>x[0]===s)||[s,s])[1],SCOLOR[s]||'gray');
  PF.taskMeta={CAT,FMT,CH,STAGES};
  let people=null;const getPeople=async()=>people||(people=(await PF.api('/api/people')).people);

  // ---------- upload ----------
  async function shrink(file,max=1600,q=.8){
    const img=await createImageBitmap(file);const k=Math.min(1,max/img.width);const c=document.createElement('canvas');
    c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    return new Promise(r=>c.toBlob(r,'image/jpeg',q));
  }
  const dataUrl=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b);});
  PF.upload=async function(file,purpose='tarefa',onProgress){
    const r=await fetch('/api/media?purpose='+purpose,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,type:file.type,size:file.size})});
    const d=await r.json().catch(()=>({}));
    if(r.status===503){ // sem Cloudinary: imagem/PDF pequeno vai embutido
      if(file.type.startsWith('video/'))throw Error('Para vídeo, o Cloudinary precisa estar configurado. Use um link do Drive por enquanto.');
      let u=await dataUrl(file.type.startsWith('image/')?await shrink(file):file);
      if(u.length>880000&&file.type.startsWith('image/'))u=await dataUrl(await shrink(file,1100,.65));
      if(u.length>880000)throw Error('Arquivo grande demais sem o Cloudinary. Use um link.');
      return u;
    }
    if(!r.ok)throw Error(d.error||'Falha no envio.');
    const fd=new FormData();for(const [k,v] of Object.entries(d.upload.fields))fd.append(k,v);fd.append('file',file);
    return new Promise((ok,bad)=>{const x=new XMLHttpRequest();x.open('POST',d.upload.url);
      x.upload.onprogress=e=>e.lengthComputable&&onProgress&&onProgress(Math.round(e.loaded/e.total*100));
      x.onload=()=>{try{const j=JSON.parse(x.responseText);x.status<300?ok(j.secure_url):bad(Error(j.error?.message||'Falha no envio.'));}catch{bad(Error('Falha no envio.'));}};
      x.onerror=()=>bad(Error('Falha de conexão.'));x.send(fd);});
  };
  const media=(url,kind,cls='')=>kind==='video'?`<video src="${esc(url)}" controls class="${cls}"></video>`:`<img src="${esc(url)}" alt="" class="${cls}">`;

  // ---------- estilos do painel ----------
  if(!document.getElementById('tk-css')){const st=document.createElement('style');st.id='tk-css';st.textContent=`
    .tk-steps{display:flex;gap:4px;margin:10px 0 14px;flex-wrap:wrap}
    .tk-steps span{flex:1;min-width:70px;text-align:center;font-size:11px;padding:6px 4px;border-radius:7px;background:var(--panel);color:var(--muted);border:1px solid var(--line)}
    .tk-steps span.done{color:var(--green);border-color:rgba(31,213,154,.35)}
    .tk-steps span.now{background:var(--orange);color:#fff;border-color:var(--orange);font-weight:700}
    .tk-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.tk-grid .full{grid-column:1/-1}
    .tk-ro{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:10px 12px;font-size:13px;white-space:pre-wrap;line-height:1.5;min-height:38px}
    .tk-refs{display:flex;flex-wrap:wrap;gap:8px}
    .tk-ref{position:relative;width:110px;border:1px solid var(--line-2);border-radius:9px;overflow:hidden;background:var(--panel);font-size:11px}
    .tk-ref img,.tk-ref video{width:100%;height:76px;object-fit:cover;display:block}
    .tk-ref a{display:block;padding:5px 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--soft)}
    .tk-ref .x{position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.7);color:#fff;display:grid;place-items:center}
    .tk-prev{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}
    .tk-frame{border-radius:12px;overflow:hidden;background:#000;border:1px solid var(--line-2);display:grid;place-items:center}
    .tk-frame.feed{aspect-ratio:4/5}.tk-frame.stories,.tk-frame.reels{aspect-ratio:9/16;max-height:520px}
    .tk-frame img,.tk-frame video{width:100%;height:100%;object-fit:contain}
    .tk-vers{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
    .tk-vers button{border:1px solid var(--line-2);border-radius:7px;padding:4px 9px;font-size:12px;color:var(--soft)}
    .tk-vers button.on{border-color:var(--orange);color:#fff;background:var(--orange-soft)}
    .tk-alert{border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:12px;border:1px solid}
    .tk-alert.adj{background:rgba(244,63,94,.1);border-color:rgba(244,63,94,.4)}
    .tk-alert.cli{background:rgba(255,88,11,.1);border-color:rgba(255,88,11,.4)}
    .tk-foot{position:sticky;bottom:-22px;background:var(--panel-2);border-top:1px solid var(--line);margin:18px -22px -22px;padding:12px 22px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .tk-com{border-left:2px solid var(--line-2);padding:4px 10px;margin-bottom:10px;font-size:13px}
    .tk-com b{font-size:12.5px}.tk-com small{color:var(--muted);font-size:11px}
    .tk-com .mention{color:var(--orange);font-weight:600}
    .tk-ments{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
    .tk-ments button{font-size:11.5px;border:1px solid var(--line-2);border-radius:99px;padding:2px 8px;color:var(--soft)}
    @media(max-width:760px){.tk-grid,.tk-prev{grid-template-columns:1fr}}`;document.head.appendChild(st);}

  // ---------- painel ----------
  async function open(id,{onChange}={}){
    let D,tab=sessionStorage.getItem('pf-tk-tab')||'detalhes',verSel=null,dirty=false;
    const m=PF.modal('<div class="empty"><i data-lucide="loader"></i><div>Abrindo a tarefa…</div></div>',{side:true,wide:true});
    m.el.style.width='min(920px,100%)';
    const ps=await getPeople().catch(()=>[]);
    async function load(){
      try{D=await PF.api('/api/tasks?id='+encodeURIComponent(id));}catch(e){m.el.innerHTML=`<div class="empty"><i data-lucide="search-x"></i><div>${esc(e.message)}</div><button class="btn btn-ghost" data-close style="margin-top:12px">Voltar</button></div>`;m.el.querySelector('[data-close]').onclick=m.close;PF.icons();return;}
      dirty=false;draw();
    }
    const T=()=>D.task,C=()=>D.can;
    const collect=()=>{const o={};m.el.querySelectorAll('[data-f]').forEach(i=>{if(!i.disabled)o[i.dataset.f]=i.value;});return o;};
    async function save(silent){
      const body=collect();if(!Object.keys(body).length)return true;
      try{await PF.api('/api/tasks',{method:'PATCH',body:{id,action:'save',...body}});dirty=false;if(!silent)PF.toast('Tarefa salva.','ok');onChange&&onChange();return true;}
      catch(e){PF.toast(e.message,'err');return false;}
    }
    async function act(body,msg){
      try{await PF.api('/api/tasks',{method:'PATCH',body:{id,...body}});if(msg)PF.toast(msg,'ok');onChange&&onChange();await load();return true;}
      catch(e){PF.toast(e.message,'err');return false;}
    }
    function draw(){
      const t=T(),c=C(),idx=STAGES.findIndex(s=>s[0]===t.stage);
      const lastAdj=D.history.find(h=>h.action==='ajuste');
      const tabs=[['detalhes','Detalhes'],['briefing','Briefing'],['conteudo','Conteúdo do post'],['entrega','Entrega'+(D.versions.length?` (v${D.versions[0].version})`:'')],['comentarios',`Comentários (${D.comments.length})`],['historico','Histórico']];
      if(!tabs.some(x=>x[0]===tab))tab='detalhes';
      m.el.innerHTML=`
        <div class="modal-head"><div style="min-width:0">
          <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-close><i data-lucide="arrow-left"></i>Voltar</button>${PF.taskStage(t.stage)}<span class="muted small">${esc(t.client_name)}</span></div>
          <h3 style="margin-top:8px">${esc(t.title)}</h3>
          <p class="muted small">${CAT[t.category]} · ${FMT[t.format]} · ${CH[t.channels]}${t.due_date?' · prazo '+t.due_date.split('-').reverse().join('/'):''}${t.assignee_name?' · com '+esc(t.assignee_name):''}</p></div>
          <button class="icon-btn" data-close title="Fechar"><i data-lucide="x"></i></button></div>
        <div class="tk-steps">${STAGES.map(([k,l],i)=>`<span class="${i<idx?'done':i===idx?'now':''}">${l}</span>`).join('')}</div>
        ${t.client_status==='ajustes'&&t.stage==='revisao'?`<div class="tk-alert cli"><b>O cliente pediu ajustes:</b> ${esc(t.client_feedback)}</div>`:''}
        ${lastAdj&&['copy','design'].includes(t.stage)&&lastAdj.to_stage===t.stage?`<div class="tk-alert adj"><b>Ajuste pedido por ${esc(lastAdj.by_name)}:</b> ${esc(lastAdj.reason)}</div>`:''}
        <div class="tabs">${tabs.map(([k,l])=>`<button data-tab="${k}" class="${k===tab?'on':''}">${l}</button>`).join('')}</div>
        <div id="tkPane"></div>
        <div class="tk-foot" id="tkFoot"></div>`;
      const pane=m.el.querySelector('#tkPane');
      ({detalhes,briefing,conteudo,entrega,comentarios,historico})[tab](pane);
      footer(m.el.querySelector('#tkFoot'));
      PF.icons();
      m.el.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(dirty&&!confirm('Há alterações não salvas. Sair mesmo assim?'))return;m.close();});
      m.el.querySelectorAll('[data-tab]').forEach(b=>b.onclick=async()=>{if(dirty&&!await save(true))return;tab=b.dataset.tab;sessionStorage.setItem('pf-tk-tab',tab);await load();});
      m.el.querySelectorAll('[data-f]').forEach(i=>i.addEventListener('input',()=>dirty=true));
    }
    const fld=(f,label,val,{type='text',ro=false,list=null,full=false,rows=null}={})=>`<label class="field ${full?'full':''}"><span>${label}</span>${
      ro?`<div class="tk-ro">${esc(list?(list.find(o=>o[0]===val)||['',val||'—'])[1]:val||'—')}</div>`
      :list?`<select class="select-in" data-f="${f}">${list.map(([k,l])=>`<option value="${esc(k)}" ${k===val?'selected':''}>${esc(l)}</option>`).join('')}</select>`
      :rows?`<textarea class="input" data-f="${f}" style="min-height:${rows}px">${esc(val||'')}</textarea>`
      :`<input class="input" data-f="${f}" type="${type}" value="${esc(val||'')}">`}</label>`;

    function detalhes(p){
      const t=T(),ro=!C().editBase;
      const meets=[['','— sem reunião —'],...(D.meeting?[[D.meeting.id,D.meeting.title]]:[])];
      p.innerHTML=`<div class="tk-grid">
        ${fld('title','Título',t.title,{ro,full:true})}
        ${fld('description','Descrição',t.description,{ro,full:true,rows:80})}
        ${fld('responsible_id','Responsável (Gestão)',t.responsible_id,{ro,list:[['','—'],...ps.map(x=>[x.id,x.name])]})}
        ${fld('due_date','Prazo',t.due_date,{ro,type:'date'})}
        ${fld('category','Categoria',t.category,{ro,list:Object.entries(CAT)})}
        ${fld('format','Formato',t.format,{ro,list:Object.entries(FMT)})}
        ${fld('channels','Canais',t.channels,{ro,list:Object.entries(CH)})}
        <label class="field"><span>Reunião de origem</span><div class="tk-ro">${D.meeting?esc(D.meeting.title)+' · '+D.meeting.date.split('-').reverse().join('/'):'—'}</div></label>
      </div>${ro?'<p class="muted tiny" style="margin-top:8px">Só a Gestão edita estes campos.</p>':''}`;
    }
    function briefing(p){
      const t=T(),ed=C().editCopy;
      p.innerHTML=`<div class="stack">
        <div class="field"><span>Direcionamento estratégico (Gestão)</span>${C().editBase?`<textarea class="input" data-f="strategy" style="min-height:90px">${esc(t.strategy)}</textarea>`:`<div class="tk-ro">${esc(t.strategy||'—')}</div>`}</div>
        <div class="field"><span>Complemento do briefing (Copy)</span>${ed?`<textarea class="input" data-f="copy_notes" style="min-height:80px" placeholder="Instruções extras, tom, o que evitar…">${esc(t.copy_notes)}</textarea>`:`<div class="tk-ro">${esc(t.copy_notes||'—')}</div>`}</div>
        <div class="field"><span>Referências (${D.refs.length})</span>
          <div class="tk-refs">${D.refs.map(r=>`<div class="tk-ref">${r.kind==='link'?`<div style="height:76px;display:grid;place-items:center;color:var(--muted)"><i data-lucide="link"></i></div>`:media(r.url,r.kind)}
            <a href="${esc(r.url)}" target="_blank" rel="noopener" title="${esc(r.label||r.url)}">${esc(r.label||r.url)}</a>${C().addRefs?`<button class="x" data-rmref="${r.id}"><i data-lucide="x" style="width:12px"></i></button>`:''}</div>`).join('')||'<span class="muted small">Nenhuma referência.</span>'}</div>
          ${C().addRefs?`<div class="row wrap" style="margin-top:8px"><input class="input" id="refUrl" placeholder="Colar link (Pinterest, Drive, YouTube…)" style="flex:1;min-width:200px"><input class="input" id="refLbl" placeholder="Descrição" style="width:160px">
            <button class="btn btn-ghost btn-sm" id="refAdd">Adicionar link</button><button class="btn btn-ghost btn-sm" id="refUp"><i data-lucide="upload"></i>Imagem/vídeo</button><input type="file" id="refFile" accept="image/*,video/mp4,video/quicktime" hidden></div>`:''}
        </div></div>`;
      if(C().addRefs){
        p.querySelector('#refAdd').onclick=()=>act({action:'ref_add',kind:'link',url:p.querySelector('#refUrl').value,label:p.querySelector('#refLbl').value},'Referência adicionada.');
        const fi=p.querySelector('#refFile');p.querySelector('#refUp').onclick=()=>fi.click();
        fi.onchange=async()=>{const f=fi.files[0];if(!f)return;PF.toast('Enviando…');try{const url=await PF.upload(f,'tarefa');await act({action:'ref_add',kind:f.type.startsWith('video')?'video':'image',url,label:f.name},'Referência adicionada.');}catch(e){PF.toast(e.message,'err');}};
        p.querySelectorAll('[data-rmref]').forEach(b=>b.onclick=()=>act({action:'ref_del',ref_id:b.dataset.rmref},'Removida.'));
      }
    }
    function conteudo(p){
      const t=T(),ed=C().editCopy;
      p.innerHTML=`<div class="stack">
        <div class="field"><span>Texto que vai na arte</span>${ed?`<textarea class="input" data-f="art_text" style="min-height:100px" placeholder="Título, frases e chamadas que o Design vai colocar na peça">${esc(t.art_text)}</textarea>`:`<div class="tk-ro">${esc(t.art_text||'—')}</div>`}</div>
        <div class="field"><span>Legenda ${t.format==='stories'?'(opcional em Stories)':''}</span>${ed?`<textarea class="input" data-f="caption" maxlength="2200" style="min-height:140px" placeholder="Legenda do post, com hashtags">${esc(t.caption)}</textarea><small class="muted tiny" id="capN">${t.caption.length}/2200</small>`:`<div class="tk-ro">${esc(t.caption||'—')}</div>`}</div>
      </div>${ed?'':'<p class="muted tiny" style="margin-top:8px">O Copy edita estes campos na etapa de Copy.</p>'}`;
      const cap=p.querySelector('[data-f=caption]');if(cap)cap.oninput=()=>p.querySelector('#capN').textContent=cap.value.length+'/2200';
    }
    function entrega(p){
      const t=T(),vs=D.versions;
      const cur=vs.find(v=>v.id===verSel)||vs[0];
      p.innerHTML=`${vs.length?`<div class="tk-prev">
          <div><div class="tk-frame ${t.format}">${media(cur.url,cur.kind)}</div>
            <div class="tk-vers">${vs.map(v=>`<button data-ver="${v.id}" class="${v.id===cur.id?'on':''}">v${v.version}${v===vs[0]?' (atual)':''}</button>`).join('')}</div>
            <p class="muted tiny" style="margin-top:6px">v${cur.version} por ${esc(cur.created_by)} em ${new Date(cur.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}${cur.note?' · '+esc(cur.note):''} · <a class="link" href="${esc(cur.url)}" target="_blank" rel="noopener" download>baixar</a></p></div>
          <div class="stack"><div class="field"><span>Texto da arte</span><div class="tk-ro">${esc(t.art_text||'—')}</div></div><div class="field"><span>Legenda</span><div class="tk-ro">${esc(t.caption||'—')}</div></div></div>
        </div>`:'<div class="empty"><i data-lucide="image"></i><div>Nenhuma entrega anexada ainda.</div></div>'}
        ${C().addVersion?`<div class="card flat" style="margin-top:14px"><b class="small">Anexar ${vs.length?'nova versão (a anterior fica guardada)':'a entrega'}</b>
          <div class="row wrap" style="margin-top:8px"><button class="btn btn-primary btn-sm" id="vUp"><i data-lucide="upload"></i>Enviar imagem ou vídeo</button><input type="file" id="vFile" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime" hidden>
          <input class="input" id="vUrl" placeholder="ou colar link https://" style="flex:1;min-width:180px"><button class="btn btn-ghost btn-sm" id="vLink">Usar link</button>
          <input class="input" id="vNote" placeholder="Observação (opcional)" style="width:180px"></div></div>`:''}`;
      p.querySelectorAll('[data-ver]').forEach(b=>b.onclick=()=>{verSel=b.dataset.ver;entrega(p);PF.icons();});
      if(C().addVersion){
        const fi=p.querySelector('#vFile');p.querySelector('#vUp').onclick=()=>fi.click();
        fi.onchange=async()=>{const f=fi.files[0];if(!f)return;PF.toast('Enviando a entrega…');try{const url=await PF.upload(f,'tarefa');await act({action:'version_add',url,kind:f.type.startsWith('video')?'video':'image',note:p.querySelector('#vNote').value},'Entrega anexada.');verSel=null;}catch(e){PF.toast(e.message,'err');}};
        p.querySelector('#vLink').onclick=()=>act({action:'version_add',url:p.querySelector('#vUrl').value,kind:/\.(mp4|mov)(\?|$)/i.test(p.querySelector('#vUrl').value)?'video':'image',note:p.querySelector('#vNote').value},'Entrega anexada.');
      }
    }
    function comentarios(p){
      const names=ps.map(x=>x.name);
      const fmt=b=>esc(b).replace(new RegExp('@('+names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','g'),'<span class="mention">@$1</span>');
      p.innerHTML=`${D.comments.map(c=>`<div class="tk-com"><b>${esc(c.author_name)}</b> <small>${new Date(c.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small><div style="white-space:pre-wrap">${names.length?fmt(c.body):esc(c.body)}</div></div>`).join('')||'<p class="muted small">Nenhum comentário. Os comentários são internos: o cliente nunca vê.</p>'}
        <textarea class="input" id="cmt" placeholder="Escreva um comentário interno… use @ para mencionar alguém" style="min-height:70px"></textarea>
        <div class="tk-ments" id="ments"></div>
        <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn btn-primary btn-sm" id="cmtGo">Comentar</button></div>`;
      const ta=p.querySelector('#cmt'),box=p.querySelector('#ments');
      ta.oninput=()=>{const m2=ta.value.slice(0,ta.selectionStart).match(/@([\p{L} ]{0,20})$/u);
        box.innerHTML=m2?ps.filter(x=>x.name.toLowerCase().startsWith(m2[1].toLowerCase())).slice(0,6).map(x=>`<button type="button" data-n="${esc(x.name)}">@${esc(x.name)}</button>`).join(''):'';
        box.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{const pos=ta.selectionStart,before=ta.value.slice(0,pos).replace(/@([\p{L} ]{0,20})$/u,'@'+b.dataset.n+' ');ta.value=before+ta.value.slice(pos);box.innerHTML='';ta.focus();});};
      p.querySelector('#cmtGo').onclick=async()=>{if(!ta.value.trim())return;await act({action:'comment',body:ta.value},'Comentário enviado.');};
    }
    function historico(p){
      p.innerHTML=D.history.map(h=>`<div class="li" style="align-items:flex-start"><span class="ico sm c-${h.action==='ajuste'||h.action==='cliente_ajustes'?'pink':h.action==='aprovada'?'green':'gray'}"><i data-lucide="${h.action==='ajuste'||h.action==='cliente_ajustes'?'rotate-ccw':h.action==='versao'?'image':h.action==='aprovada'?'check':'arrow-right'}"></i></span>
        <div class="t"><b style="white-space:normal">${ACT[h.action]||h.action}${h.to_stage&&h.action!=='versao'?' → '+((STAGES.find(s=>s[0]===h.to_stage)||['',h.to_stage])[1]):''}${h.to_user?' ('+esc(h.to_user)+')':''}</b>
        <span>${esc(h.by_name)} · ${new Date(h.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>${h.reason?`<div class="small" style="margin-top:3px;color:var(--soft)">${esc(h.reason)}</div>`:''}</div></div>`).join('');
    }
    function footer(f){
      const c=C(),t=T(),b=(id2,label,cls='btn-ghost',icon='')=>`<button class="btn ${cls}" id="${id2}">${icon?`<i data-lucide="${icon}"></i>`:''}${label}</button>`;
      f.innerHTML=[c.delete&&b('tkDel','Apagar','btn-ghost','trash-2'),
        (c.editBase||c.editCopy)&&b('tkSave','Salvar','btn-ghost','save'),
        c.sendCopy&&b('tkCopy','Enviar para Copy','btn-primary','send'),
        c.sendDesign&&b('tkDesign','Enviar para Design','btn-primary','send'),
        c.sendReview&&b('tkReview','Enviar para Revisão','btn-primary','send'),
        c.adjust&&b('tkAdj','Solicitar ajustes','btn-outline','rotate-ccw'),
        c.share&&b('tkShare',t.stage==='cliente'?'Reenviar ao cliente':'Liberar para o cliente','btn-primary','share-2'),
        c.clientResult&&b('tkRes','Registrar retorno do cliente','btn-ghost','message-square')].filter(Boolean).join('')||'<span class="muted small">Você só pode acompanhar esta tarefa nesta etapa.</span>';
      const on=(i,fn)=>{const e=f.querySelector('#'+i);if(e)e.onclick=fn;};
      on('tkSave',()=>save());
      const send=async(to,label)=>{if(!await save(true))return;
        const ppl=ps;const m2=PF.modal(`<div class="modal-head"><h3>Enviar para ${label}</h3><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
          <form class="stack" id="f"><label class="field"><span>Quem recebe</span><select class="select-in" name="assignee_id"><option value="">Sugestão automática (equipe do cliente)</option>${ppl.map(x=>`<option value="${x.id}">${esc(x.name)}${x.role?' · '+esc(x.role):''}</option>`).join('')}</select></label>
          <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Enviar</button></div></form>`);
        m2.el.querySelector('#f').onsubmit=async e=>{e.preventDefault();const ok=await act({action:'send',to,assignee_id:e.target.elements.assignee_id.value},`Tarefa enviada para ${label}.`);if(ok)m2.close();};};
      on('tkCopy',()=>send('copy','Copy'));on('tkDesign',()=>send('design','Design'));on('tkReview',()=>send('revisao','Revisão'));
      on('tkDel',async()=>{if(!confirm('Apagar esta tarefa?'))return;try{await PF.api('/api/tasks',{method:'DELETE',body:{id}});PF.toast('Tarefa apagada.','ok');onChange&&onChange();m.close();}catch(e){PF.toast(e.message,'err');}});
      on('tkAdj',()=>{const m2=PF.modal(`<div class="modal-head"><h3>Solicitar ajustes</h3><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
          <form class="stack" id="f"><div class="field"><span>O que precisa ser corrigido?</span><div class="toggle" style="align-self:flex-start"><button type="button" data-tg="design" class="on">Arte (Design)</button><button type="button" data-tg="copy">Texto / legenda (Copy)</button></div></div>
          <label class="field"><span>Motivo (obrigatório)</span><textarea class="input" name="reason" required minlength="5" placeholder="Ex.: aumentar o logo e trocar a foto do fundo"></textarea></label>
          <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Devolver</button></div></form>`);
        let target='design';m2.el.querySelectorAll('[data-tg]').forEach(x=>x.onclick=()=>{target=x.dataset.tg;m2.el.querySelectorAll('[data-tg]').forEach(y=>y.classList.toggle('on',y===x));});
        m2.el.querySelector('#f').onsubmit=async e=>{e.preventDefault();if(await act({action:'adjust',target,reason:e.target.elements.reason.value},'Tarefa devolvida para ajustes.'))m2.close();};});
      on('tkShare',()=>{const v=D.versions[0];if(!v)return PF.toast('Não há entrega para mostrar.','err');
        const m2=PF.modal(`<div class="modal-head"><div><h3>Liberar para aprovação do cliente</h3><p class="muted small">O cliente vê só o que está abaixo: a peça, a legenda e a sua mensagem.</p></div><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
          <div class="tk-prev"><div class="tk-frame ${t.format}">${media(v.url,v.kind)}</div><div class="stack"><div class="field"><span>Legenda</span><div class="tk-ro">${esc(t.caption||'—')}</div></div>
          <label class="field"><span>Mensagem para o cliente</span><textarea class="input" id="msg" style="min-height:90px">Olá! Segue o material "${esc(t.title)}" para sua aprovação. É só abrir o link, conferir e aprovar ou pedir ajustes.</textarea></label>
          <label class="field"><span>Email do cliente (para envio por email)</span><input class="input" id="em" value="${esc(t.client_email||'')}"></label></div></div>
          <div class="modal-foot"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-ghost" data-via="link"><i data-lucide="link"></i>Só copiar o link</button><button class="btn btn-ghost" data-via="email"><i data-lucide="mail"></i>Enviar por email</button><button class="btn btn-primary" data-via="whatsapp"><i data-lucide="message-circle"></i>Enviar pelo WhatsApp</button></div>`,{wide:true});
        m2.el.querySelectorAll('[data-via]').forEach(x=>x.onclick=async()=>{const via=x.dataset.via,message=m2.el.querySelector('#msg').value;
          try{const r=await PF.api('/api/tasks',{method:'PATCH',body:{id,action:'share',via,message,to:m2.el.querySelector('#em').value}});
            if(via==='whatsapp'){const fone=(r.phone||'').replace(/\D/g,'');window.open(`https://wa.me/${fone?(fone.length<=11?'55'+fone:fone):''}?text=${encodeURIComponent(message+'\n\n'+r.url)}`,'_blank');}
            if(via==='link'){try{await navigator.clipboard.writeText(r.url);}catch{}prompt('Link de aprovação (copie):',r.url);}
            PF.toast(via==='email'?'Enviado por email.':'Liberado para o cliente.','ok');m2.close();onChange&&onChange();load();}catch(e){PF.toast(e.message,'err');}});});
      on('tkRes',()=>{const m2=PF.modal(`<div class="modal-head"><h3>Retorno do cliente</h3><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
          <form class="stack" id="f"><p class="muted small">Use quando o cliente respondeu por fora do link (WhatsApp, ligação).</p>
          <label class="field"><span>O que o cliente disse</span><textarea class="input" name="feedback"></textarea></label>
          <div class="modal-foot"><button type="button" class="btn btn-ghost" data-r="ajustes">Pediu ajustes</button><button type="button" class="btn btn-primary" data-r="aprovada">Aprovou</button></div></form>`);
        m2.el.querySelectorAll('[data-r]').forEach(x=>x.onclick=async()=>{if(await act({action:'client_result',result:x.dataset.r,feedback:m2.el.querySelector('[name=feedback]').value},'Retorno registrado.'))m2.close();});});
    }
    load();
  }

  // ---------- nova tarefa (Gestão) ----------
  async function nova({client_id,meeting_id,meetings=[],onDone}={}){
    const ps=await getPeople().catch(()=>[]);
    const m=PF.modal(`<div class="modal-head"><div><h3>Nova tarefa</h3><p class="muted small">Fica na Gestão até você clicar em "Enviar para Copy".</p></div><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
      <form class="stack" id="f">
        <label class="field"><span>Título *</span><input class="input" name="title" required minlength="3" placeholder="Ex.: Novembro Azul"></label>
        <label class="field"><span>Descrição *</span><textarea class="input" name="description" placeholder="O que é o post/campanha"></textarea></label>
        <label class="field"><span>Direcionamento estratégico</span><textarea class="input" name="strategy" placeholder="Objetivo, público, tom de voz, referências da reunião…"></textarea></label>
        <div class="grid g3"><label class="field"><span>Responsável</span><select class="select-in" name="responsible_id">${ps.map(x=>`<option value="${x.id}" ${x.id===PF.user.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Prazo *</span><input class="input" type="date" name="due_date" required></label>
          <label class="field"><span>Categoria</span><select class="select-in" name="category">${Object.entries(CAT).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label>
          <label class="field"><span>Formato</span><select class="select-in" name="format">${Object.entries(FMT).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label>
          <label class="field"><span>Canais</span><select class="select-in" name="channels">${Object.entries(CH).map(([k,l])=>`<option value="${k}" ${k==='ambos'?'selected':''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>Reunião (opcional)</span><select class="select-in" name="meeting_id"><option value="">—</option>${meetings.map(x=>`<option value="${x.id}" ${x.id===meeting_id?'selected':''}>${esc(x.title)} · ${x.date.split('-').reverse().join('/')}</option>`).join('')}</select></label></div>
        <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">Salvar tarefa</button></div>
      </form>`,{side:true});
    m.el.querySelector('#f').onsubmit=async e=>{e.preventDefault();
      const body=Object.fromEntries(new FormData(e.target));if(!body.description.trim())return PF.toast('Escreva a descrição.','err');
      try{const r=await PF.api('/api/tasks',{method:'POST',body:{client_id,...body}});m.close();PF.toast('Tarefa salva na Gestão.','ok');onDone&&onDone(r.id);open(r.id,{onChange:onDone});}catch(x){PF.toast(x.message,'err');}};
  }
  PF.Tarefa={open,nova};
})();
