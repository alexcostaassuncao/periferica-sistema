/* =========================================================
   Modo desenvolvedor (só Administrador e Desenvolvedor)
   - Botão flutuante: "Apontar na tela" e "Ver sugestões"
   - Apontar: clica num pedaço da tela, escreve a sugestão, anexa prints
   - Painel lateral: lista, status, comentários e "mostrar na tela"
   ========================================================= */
(function(){
  if(window.PFDev)return;
  const esc=PF.esc;
  const KINDS=[['melhoria','Melhoria','sparkles','blue'],['bug','Erro','bug','pink'],['visual','Visual','palette','purple'],['texto','Texto','type','yellow'],['ideia','Ideia','lightbulb','green']];
  const PRI=[['baixa','Baixa','gray'],['media','Média','yellow'],['alta','Alta','pink']];
  const ST=[['nova','Nova','orange'],['analise','Em análise','purple'],['andamento','Em andamento','blue'],['feita','Feita','green'],['descartada','Descartada','gray']];
  const label=(list,k)=>list.find(x=>x[0]===k)||list[0];
  const page=location.pathname;
  let data={suggestions:[],openByPage:[]},picking=false,hoverEl=null,panelTab='page';

  // ---------- estilos ----------
  const css=document.createElement('style');
  css.textContent=`
  .dv-fab{position:fixed;right:20px;bottom:20px;z-index:70;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
  .dv-fab>button.main{display:flex;align-items:center;gap:8px;background:#1b1430;border:1px solid #8b5cf6;color:#e9e2ff;border-radius:99px;padding:10px 16px;font-weight:700;font-size:13px;box-shadow:0 10px 30px rgba(139,92,246,.35)}
  .dv-fab>button.main.on{background:#8b5cf6;color:#fff}
  .dv-fab .cnt{background:var(--orange);color:#fff;border-radius:99px;font-size:11px;padding:1px 7px}
  .dv-menu{display:none;flex-direction:column;gap:6px;background:var(--panel-2);border:1px solid var(--line-2);border-radius:12px;padding:6px;box-shadow:0 14px 40px rgba(0,0,0,.5)}
  .dv-menu.show{display:flex}
  .dv-menu button{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:8px;font-size:13px;color:var(--soft);text-align:left}
  .dv-menu button:hover{background:var(--panel-3);color:#fff}
  .dv-banner{position:fixed;top:0;left:0;right:0;z-index:95;background:#8b5cf6;color:#fff;text-align:center;font-size:13px;font-weight:600;padding:8px 12px}
  .dv-banner button{margin-left:12px;text-decoration:underline;color:#fff}
  .dv-hl{position:fixed;z-index:94;pointer-events:none;border:2px solid #8b5cf6;background:rgba(139,92,246,.12);border-radius:6px;transition:all .06s}
  .dv-hl span{position:absolute;top:-22px;left:-2px;background:#8b5cf6;color:#fff;font-size:11px;padding:2px 7px;border-radius:5px;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis}
  body.dv-picking,body.dv-picking *{cursor:crosshair!important}
  .dv-mark{outline:3px solid #a78bfa!important;outline-offset:3px;border-radius:6px}
  .dv-flash{outline:3px solid #8b5cf6!important;outline-offset:3px;box-shadow:0 0 0 9999px rgba(0,0,0,.35)!important;position:relative;z-index:2;transition:outline .2s}
  .dv-chips{display:flex;flex-wrap:wrap;gap:6px}
  .dv-chips label{display:flex;align-items:center;gap:6px;border:1px solid var(--line-2);border-radius:99px;padding:6px 11px;font-size:12.5px;cursor:pointer}
  .dv-chips input{display:none}
  .dv-chips label:has(input:checked){border-color:#8b5cf6;background:rgba(139,92,246,.18);color:#fff}
  .dv-chips .lucide{width:14px;height:14px}
  .dv-imgs{display:flex;flex-wrap:wrap;gap:8px}
  .dv-img{position:relative;width:104px;height:70px;border-radius:8px;overflow:hidden;background:var(--panel-3);border:1px solid var(--line-2);display:grid;place-items:center}
  .dv-img img{width:100%;height:100%;object-fit:cover;cursor:zoom-in}
  .dv-img .x{position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.7);color:#fff;display:grid;place-items:center}
  .dv-img .x .lucide{width:12px}
  .dv-add{width:104px;height:70px;border:1.5px dashed var(--line-2);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:11px;color:var(--muted)}
  .dv-add:hover{border-color:#8b5cf6;color:#fff}
  .dv-where{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:9px 11px;font-size:12px;color:var(--soft)}
  .dv-where b{color:#fff}
  .dv-item{border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;background:var(--panel)}
  .dv-item+.dv-item{margin-top:10px}
  .dv-item .body{font-size:13px;line-height:1.5;white-space:pre-wrap}
  .dv-item .meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11.5px;color:var(--muted)}
  .dv-item .cm{font-size:12px;border-left:2px solid var(--line-2);padding-left:9px;color:var(--soft)}
  .dv-item .cm b{color:#fff}
  .dv-zoom{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.85);display:grid;place-items:center;padding:24px;cursor:zoom-out}
  .dv-zoom img{max-width:100%;max-height:100%;border-radius:8px}
  `;
  document.head.appendChild(css);

  // ---------- botão flutuante ----------
  const fab=document.createElement('div');fab.className='dv-fab';
  fab.innerHTML=`<div class="dv-menu" id="dvMenu">
      <button data-dv="pick"><i data-lucide="crosshair"></i>Apontar na tela</button>
      <button data-dv="new"><i data-lucide="message-square-plus"></i>Sugestão geral desta página</button>
      <button data-dv="list"><i data-lucide="list-checks"></i>Ver sugestões</button>
    </div>
    <button class="main" id="dvMain" title="Modo desenvolvedor"><i data-lucide="code-xml"></i>Modo desenvolvedor <span class="cnt" id="dvCnt" hidden>0</span></button>`;
  document.body.appendChild(fab);
  const menu=fab.querySelector('#dvMenu');
  fab.querySelector('#dvMain').onclick=()=>{if(picking)return stopPick();menu.classList.toggle('show');};
  fab.querySelectorAll('[data-dv]').forEach(b=>b.onclick=()=>{menu.classList.remove('show');({pick:startPick,new:()=>openForm(null),list:()=>openPanel()})[b.dataset.dv]();});
  PF.icons();

  async function load(){
    try{data=await PF.api('/api/suggestions');}catch{return;}
    const n=data.openByPage.find(x=>x.page===page)?.n||0;
    const c=fab.querySelector('#dvCnt');c.hidden=!n;c.textContent=n;c.title=n+' sugestão(ões) abertas nesta página';
  }

  // ---------- apontar elemento ----------
  const hl=document.createElement('div');hl.className='dv-hl';hl.innerHTML='<span></span>';
  const banner=document.createElement('div');banner.className='dv-banner';
  banner.innerHTML='Modo desenvolvedor: clique na parte da tela que precisa melhorar. <button type="button">Cancelar (Esc)</button>';
  const ours=el=>el.closest('.dv-fab,.dv-banner,.dv-hl,.overlay,.toast');
  function describe(el){
    const t=(el.getAttribute('aria-label')||el.innerText||el.getAttribute('placeholder')||el.alt||'').trim().replace(/\s+/g,' ');
    const name={BUTTON:'Botão',A:'Link',INPUT:'Campo',SELECT:'Seleção',TABLE:'Tabela',TR:'Linha',TD:'Célula',IMG:'Imagem',H1:'Título',H2:'Título',H3:'Título',TEXTAREA:'Campo'}[el.tagName]||(el.classList.contains('card')?'Card':'Área');
    return name+(t?': '+t.slice(0,70):'');
  }
  function selectorOf(el){
    const parts=[];
    for(let e=el;e&&e!==document.body&&parts.length<10;e=e.parentElement){
      if(e.id&&!/^\d/.test(e.id)){parts.unshift('#'+CSS.escape(e.id));break;}
      const tag=e.tagName.toLowerCase(),sib=[...e.parentElement.children].filter(x=>x.tagName===e.tagName);
      parts.unshift(sib.length>1?`${tag}:nth-of-type(${sib.indexOf(e)+1})`:tag);
    }
    return parts.join(' > ');
  }
  const onMove=e=>{
    const el=document.elementFromPoint(e.clientX,e.clientY);
    if(!el||ours(el)){hl.style.display='none';hoverEl=null;return;}
    hoverEl=el;const r=el.getBoundingClientRect();
    Object.assign(hl.style,{display:'block',left:r.left-3+'px',top:r.top-3+'px',width:r.width+6+'px',height:r.height+6+'px'});
    hl.firstChild.textContent=describe(el);
  };
  const onClick=e=>{
    if(!picking||ours(e.target))return;
    e.preventDefault();e.stopPropagation();
    const el=hoverEl||e.target;stopPick();
    openForm(el);
  };
  const onKey=e=>{if(e.key==='Escape')stopPick();};
  function startPick(){
    picking=true;document.body.classList.add('dv-picking');
    document.body.append(banner,hl);fab.querySelector('#dvMain').classList.add('on');
    banner.querySelector('button').onclick=stopPick;
    document.addEventListener('mousemove',onMove,true);document.addEventListener('click',onClick,true);document.addEventListener('keydown',onKey,true);
  }
  function stopPick(){
    picking=false;document.body.classList.remove('dv-picking');banner.remove();hl.remove();hl.style.display='none';
    fab.querySelector('#dvMain').classList.remove('on');
    document.removeEventListener('mousemove',onMove,true);document.removeEventListener('click',onClick,true);document.removeEventListener('keydown',onKey,true);
  }

  // ---------- prints ----------
  let h2c=null;
  const loadH2C=()=>h2c||(h2c=new Promise((ok,bad)=>{if(window.html2canvas)return ok();const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';s.onload=ok;s.onerror=()=>bad(Error('Não foi possível carregar o capturador de tela.'));document.head.appendChild(s);}));
  async function capture(el){
    await loadH2C();
    if(el)el.classList.add('dv-mark');
    fab.style.visibility='hidden';
    try{
      const canvas=await html2canvas(document.body,{backgroundColor:'#05070a',x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,scale:Math.min(devicePixelRatio,1.5),useCORS:true,logging:false,
        ignoreElements:n=>n.classList&&(n.classList.contains('overlay')||n.classList.contains('toast')),
        // Na cópia usada pelo print, sem animações de entrada (senão os cards saem invisíveis).
        onclone:doc=>{const st=doc.createElement('style');st.textContent='*,*::before,*::after{animation:none!important;transition:none!important}.fade{opacity:1!important;transform:none!important}';doc.head.appendChild(st);}});
      return await new Promise(r=>canvas.toBlob(r,'image/jpeg',.82));
    }finally{if(el)el.classList.remove('dv-mark');fab.style.visibility='';}
  }
  // Reduz e converte (para o modo sem Cloudinary e para prints grandes).
  async function shrink(blob,max=1400,q=.75){
    const img=await createImageBitmap(blob);const k=Math.min(1,max/img.width);
    const c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    return new Promise(r=>c.toBlob(r,'image/jpeg',q));
  }
  const toDataUrl=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b);});
  async function upload(blob){
    const file=blob.type==='image/jpeg'||blob.type==='image/png'||blob.type==='image/webp'?blob:await shrink(blob);
    const r=await fetch('/api/media?purpose=sugestao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'print.jpg',type:file.type,size:file.size})});
    if(r.status===503){ // sem Cloudinary: guarda a imagem reduzida junto com a sugestão
      let small=await shrink(file);let url=await toDataUrl(small);
      if(url.length>880000){small=await shrink(file,1000,.6);url=await toDataUrl(small);}
      if(url.length>880000)throw Error('Imagem grande demais. Recorte o print e tente de novo.');
      return url;
    }
    const d=await r.json();if(!r.ok)throw Error(d.error||'Falha ao enviar o print.');
    const fd=new FormData();for(const [k,v] of Object.entries(d.upload.fields))fd.append(k,v);fd.append('file',file);
    const up=await fetch(d.upload.url,{method:'POST',body:fd});const res=await up.json();
    if(!up.ok)throw Error(res.error?.message||'Falha ao enviar o print.');
    return res.secure_url;
  }
  function zoom(src){const z=document.createElement('div');z.className='dv-zoom';z.innerHTML=`<img src="${esc(src)}" alt="">`;z.onclick=()=>z.remove();document.body.appendChild(z);}

  // ---------- formulário ----------
  async function openForm(el){
    const target=el?{selector:selectorOf(el),element_text:describe(el)}:{selector:'',element_text:''};
    const images=[];let busy=0;
    const m=PF.modal(`<div class="modal-head"><div><h3><i data-lucide="code-xml" style="width:19px;vertical-align:-3px;color:#a78bfa"></i> Nova sugestão</h3><p class="muted small">Vai para a lista de melhorias do sistema.</p></div><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
    <form class="stack" id="dvF">
      <div class="dv-where">Página: <b>${esc(document.title.replace('Periférica · ',''))}</b>${target.element_text?`<br>Parte da tela: <b>${esc(target.element_text)}</b>`:'<br><span class="muted">Sugestão geral da página</span>'}</div>
      <div class="field"><span>Tipo</span><div class="dv-chips">${KINDS.map(([k,l,i],n)=>`<label><input type="radio" name="kind" value="${k}" ${n===0?'checked':''}><i data-lucide="${i}"></i>${l}</label>`).join('')}</div></div>
      <div class="field"><span>Prioridade</span><div class="dv-chips">${PRI.map(([k,l])=>`<label><input type="radio" name="priority" value="${k}" ${k==='media'?'checked':''}>${l}</label>`).join('')}</div></div>
      <label class="field"><span>O que precisa melhorar?</span><textarea class="input" name="body" required placeholder="Ex.: Este botão deveria abrir o contrato direto, sem passar pela lista. / O texto está cortando no celular." style="min-height:120px"></textarea></label>
      <div class="field"><span>Prints <small class="muted">(cole com Ctrl+V, envie arquivos ou capture a tela)</small></span>
        <div class="dv-imgs" id="dvImgs"></div>
        <input type="file" id="dvFile" accept="image/png,image/jpeg,image/webp" multiple hidden>
      </div>
      <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="dvSend" style="background:#8b5cf6"><i data-lucide="send"></i>Enviar sugestão</button></div>
    </form>`,{side:true});
    const box=m.el.querySelector('#dvImgs'),fileIn=m.el.querySelector('#dvFile');
    const draw=()=>{
      box.innerHTML=images.map((src,i)=>`<div class="dv-img">${src==='…'?'<span class="tiny muted">enviando…</span>':`<img src="${esc(src)}" alt="Print ${i+1}" data-z="${i}">`}<button type="button" class="x" data-rm="${i}" aria-label="Remover"><i data-lucide="x"></i></button></div>`).join('')+
        (images.length<6?`<button type="button" class="dv-add" id="dvCap"><i data-lucide="camera"></i>Capturar tela</button><button type="button" class="dv-add" id="dvUp"><i data-lucide="image-plus"></i>Enviar imagem</button>`:'');
      box.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{images.splice(+b.dataset.rm,1);draw();});
      box.querySelectorAll('[data-z]').forEach(i=>i.onclick=()=>zoom(i.src));
      const cap=box.querySelector('#dvCap');if(cap)cap.onclick=async()=>{m.el.parentElement.style.display='none';try{await add(await capture(el));}catch(e){PF.toast(e.message,'err');}finally{m.el.parentElement.style.display='';}};
      const upb=box.querySelector('#dvUp');if(upb)upb.onclick=()=>fileIn.click();
      PF.icons();
    };
    async function add(blob){
      if(!blob)return;if(images.length>=6)return PF.toast('Máximo de 6 prints.','err');
      const i=images.push('…')-1;busy++;draw();
      try{images[i]=await upload(blob);}catch(e){images.splice(i,1);PF.toast(e.message,'err');}
      finally{busy--;draw();}
    }
    fileIn.onchange=()=>{[...fileIn.files].forEach(add);fileIn.value='';};
    m.el.addEventListener('paste',e=>{const f=[...(e.clipboardData?.files||[])].filter(x=>x.type.startsWith('image/'));if(f.length){e.preventDefault();f.forEach(add);}});
    draw();
    // Apontou um elemento: já tira o print da tela com ele destacado.
    if(el){m.el.parentElement.style.display='none';try{await add(await capture(el));}catch{}finally{m.el.parentElement.style.display='';}}
    m.el.querySelector('textarea').focus();
    m.el.querySelector('#dvF').onsubmit=async e=>{
      e.preventDefault();if(busy)return PF.toast('Aguarde os prints terminarem de enviar.','err');
      const F=e.target.elements,btn=m.el.querySelector('#dvSend');btn.disabled=true;
      try{
        await PF.api('/api/suggestions',{method:'POST',body:{page,page_title:document.title.replace('Periférica · ',''),...target,viewport:innerWidth+'x'+innerHeight,
          kind:F.kind.value,priority:F.priority.value,body:F.body.value,images:images.filter(x=>x!=='…')}});
        m.close();PF.toast('Sugestão enviada. Obrigado!','ok');load();
      }catch(x){PF.toast(x.message,'err');btn.disabled=false;}
    };
  }

  // ---------- painel de sugestões ----------
  async function openPanel(focusId){
    await load();
    const m=PF.modal(`<div class="modal-head"><div><h3>Sugestões do sistema</h3><p class="muted small">Melhorias apontadas pela equipe no modo desenvolvedor.</p></div><button class="icon-btn" data-close><i data-lucide="x"></i></button></div><div id="dvP"></div>`,{side:true});
    const box=m.el.querySelector('#dvP');let status='abertas';
    const render=()=>{
      const all=data.suggestions;
      const list=all.filter(s=>(panelTab==='all'||s.page===page)&&(status==='todas'||(status==='abertas'?['nova','analise','andamento'].includes(s.status):s.status===status)));
      box.innerHTML=`
      <div class="tabs"><button class="${panelTab==='page'?'on':''}" data-pt="page">Esta página<span class="count">${all.filter(s=>s.page===page).length}</span></button><button class="${panelTab==='all'?'on':''}" data-pt="all">Todas<span class="count">${all.length}</span></button></div>
      <div class="filters"><select class="select-in" id="dvSt"><option value="abertas">Abertas</option>${ST.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}<option value="todas">Todas</option></select>
        <button class="btn btn-ghost btn-sm" id="dvNew" style="margin-left:auto"><i data-lucide="crosshair"></i>Apontar na tela</button></div>
      ${list.length?list.map(s=>{const [,kl,ki,kc]=label(KINDS,s.kind),[,pl,pc]=label(PRI,s.priority);return `<div class="dv-item" id="dv-${s.id}">
        <div class="meta">${PF.badge(kl,kc)}${PF.badge('Prioridade '+pl.toLowerCase(),pc)}
          <select class="select-in" data-st="${s.id}" style="width:auto;margin-left:auto;padding:4px 28px 4px 8px;font-size:12px">${ST.map(([k,l])=>`<option value="${k}" ${k===s.status?'selected':''}>${l}</option>`).join('')}</select></div>
        ${s.element_text?`<div class="tiny muted"><i data-lucide="mouse-pointer-click" style="width:12px;vertical-align:-2px"></i> ${esc(s.element_text)}</div>`:''}
        <div class="body">${esc(s.body)}</div>
        ${s.images.length?`<div class="dv-imgs">${s.images.map(src=>`<div class="dv-img"><img src="${esc(src)}" alt="Print" data-z></div>`).join('')}</div>`:''}
        <div class="meta"><span>${esc(s.author_name)} · ${new Date(s.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
          ${panelTab==='all'?`<span>· ${esc(s.page_title||s.page)}</span>`:''}
          <span style="margin-left:auto"></span>
          ${s.selector||s.page!==page?`<button class="link tiny" data-show="${s.id}">Mostrar na tela</button>`:''}
          <button class="icon-btn" data-del="${s.id}" title="Apagar" style="width:26px;height:26px"><i data-lucide="trash-2"></i></button></div>
        ${s.comments.map(c=>`<div class="cm"><b>${esc(c.author_name)}:</b> ${esc(c.body)}</div>`).join('')}
        <form class="row" data-cm="${s.id}"><input class="input" name="c" placeholder="Comentar…" style="padding:7px 10px;font-size:12.5px"><button class="btn btn-ghost btn-sm">Enviar</button></form>
      </div>`;}).join(''):`<div class="empty"><i data-lucide="inbox"></i><div>Nenhuma sugestão ${status==='abertas'?'aberta ':''}${panelTab==='page'?'nesta página':''}.</div></div>`}`;
      box.querySelector('#dvSt').value=status;
      box.querySelector('#dvSt').onchange=e=>{status=e.target.value;render();};
      box.querySelector('#dvNew').onclick=()=>{m.close();startPick();};
      box.querySelectorAll('[data-pt]').forEach(b=>b.onclick=()=>{panelTab=b.dataset.pt;render();});
      box.querySelectorAll('[data-z]').forEach(i=>i.onclick=()=>zoom(i.src));
      box.querySelectorAll('[data-st]').forEach(sel=>sel.onchange=async()=>{try{await PF.api('/api/suggestions',{method:'PATCH',body:{id:sel.dataset.st,status:sel.value}});PF.toast('Status atualizado.','ok');await load();render();}catch(e){PF.toast(e.message,'err');}});
      box.querySelectorAll('[data-cm]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const v=f.elements.c.value.trim();if(!v)return;try{await PF.api('/api/suggestions',{method:'PATCH',body:{id:f.dataset.cm,comment:v}});await load();render();}catch(x){PF.toast(x.message,'err');}});
      box.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('Apagar esta sugestão?'))return;try{await PF.api('/api/suggestions',{method:'DELETE',body:{id:b.dataset.del}});await load();render();}catch(e){PF.toast(e.message,'err');}});
      box.querySelectorAll('[data-show]').forEach(b=>b.onclick=()=>{const s=data.suggestions.find(x=>x.id===b.dataset.show);if(s.page!==page){location.href=s.page+'?sugestao='+s.id;return;}m.close();show(s);});
      PF.icons();
      if(focusId){const it=box.querySelector('#dv-'+CSS.escape(focusId));if(it){it.scrollIntoView({block:'center'});it.style.borderColor='#8b5cf6';}focusId=null;}
    };
    render();
  }
  function show(s){
    let el=null;try{el=s.selector?document.querySelector(s.selector):null;}catch{}
    if(!el)return PF.toast('Essa parte da tela não existe mais (a página pode ter mudado).','err');
    el.scrollIntoView({block:'center',behavior:'smooth'});el.classList.add('dv-flash');setTimeout(()=>el.classList.remove('dv-flash'),2600);
  }

  window.PFDev={startPick,openPanel};
  load().then(()=>{
    const id=new URLSearchParams(location.search).get('sugestao');
    if(id){const s=data.suggestions.find(x=>x.id===id);setTimeout(()=>{if(s)show(s);openPanel(id);},900);}
  });
})();
