/* Reuniões — o mesmo registro na Agenda e na Gestão do cliente.
   PF.Reuniao.form(meeting|{client_id,date},{onDone})   criar / editar
   PF.Reuniao.ata(meetingId,{onDone})                    ata manual + anexos + compartilhar com o cliente */
(function(){
  const esc=PF.esc;
  const PLACES=[['online','Online (Meet)'],['sala','Sala de Reunião'],['estudio','Estúdio'],['cliente','No cliente'],['mesa','Minha mesa']];
  PF.placeLabel=k=>(PLACES.find(p=>p[0]===k)||['',k])[1];
  let people=null,clients=null;
  const getPeople=async()=>people||(people=(await PF.api('/api/people')).people);
  const getClients=async()=>clients||(clients=(await PF.api('/api/clients')).clients);

  async function form(mt={},{onDone}={}){
    const [ps,cs]=await Promise.all([getPeople().catch(()=>[]),getClients().catch(()=>[])]);
    let parts=[...(mt.participants||[])];
    const hoje=new Date().toISOString().slice(0,10);
    const m=PF.modal(`<div class="modal-head"><div><h3>${mt.id?'Editar reunião':'Nova reunião'}</h3><p class="muted small">Aparece na Agenda, na Gestão do cliente e no histórico.</p></div><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
      <form class="stack" id="f">
        <label class="field"><span>Título *</span><input class="input" name="title" required value="${esc(mt.title||'')}" placeholder="Ex.: Reunião mensal"></label>
        <label class="field"><span>Cliente</span><select class="select-in" name="client_id"><option value="">— Reunião interna —</option>${cs.map(c=>`<option value="${c.id}" ${c.id===mt.client_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
        <div class="grid g3"><label class="field"><span>Data *</span><input class="input" type="date" name="date" required value="${esc(mt.date||hoje)}"></label>
          <label class="field"><span>Início *</span><input class="input" type="time" name="start_time" required value="${esc(mt.start_time||'09:00')}"></label>
          <label class="field"><span>Fim *</span><input class="input" type="time" name="end_time" required value="${esc(mt.end_time||'10:00')}"></label></div>
        <label class="field"><span>Local</span><select class="select-in" name="place">${PLACES.map(([k,l])=>`<option value="${k}" ${k===(mt.place||'online')?'selected':''}>${l}</option>`).join('')}</select></label>
        <div id="rooms" class="small"></div>
        <label class="field"><span>Link do Google Meet</span><input class="input" name="meet_url" value="${esc(mt.meet_url||'')}" placeholder="https://meet.google.com/abc-defg-hij"></label>
        <div class="field"><span>Participantes</span>
          <div class="row wrap" id="parts" style="gap:6px"></div>
          <div class="row" style="margin-top:6px"><select class="select-in" id="addSel"><option value="">Escolha alguém…</option>${ps.map(p=>`<option value="${p.id}">${esc(p.name)}${p.role?' · '+esc(p.role):''}</option>`).join('')}</select><button type="button" class="btn btn-ghost btn-sm" id="addP"><i data-lucide="plus"></i>Adicionar participante</button></div></div>
        <label class="field"><span>Descrição / pauta</span><textarea class="input" name="description" style="min-height:70px">${esc(mt.description||'')}</textarea></label>
        <div class="modal-foot">${mt.id?'<button type="button" class="btn btn-ghost" id="del" style="margin-right:auto"><i data-lucide="trash-2"></i>Cancelar reunião</button>':''}<button type="button" class="btn btn-ghost" data-close>Fechar</button><button class="btn btn-primary" id="save"><i data-lucide="save"></i>Salvar</button></div>
      </form>`,{side:true});
    const F=m.el.querySelector('#f').elements;
    const drawParts=()=>{m.el.querySelector('#parts').innerHTML=parts.map(id=>{const p=ps.find(x=>x.id===id);return `<span class="badge b-gray" style="padding:5px 8px">${esc(p?p.name:'?')} <button type="button" data-rm="${id}" style="margin-left:4px;color:var(--muted)">×</button></span>`;}).join('')||'<span class="muted small">Ninguém adicionado.</span>';
      m.el.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{parts=parts.filter(x=>x!==b.dataset.rm);drawParts();});};
    m.el.querySelector('#addP').onclick=()=>{const v=m.el.querySelector('#addSel').value;if(!v)return PF.toast('Escolha a pessoa na lista.','err');if(!parts.includes(v))parts.push(v);m.el.querySelector('#addSel').value='';drawParts();};
    const rooms=async()=>{const box=m.el.querySelector('#rooms');if(!['sala','estudio'].includes(F.place.value)||!F.date.value||!F.start_time.value||!F.end_time.value){box.innerHTML='';return;}
      try{const r=await PF.api(`/api/meetings?rooms=1&date=${F.date.value}&start=${F.start_time.value}&end=${F.end_time.value}&ignore=${mt.id||''}`);
        box.innerHTML=r.rooms.map(x=>`<span class="badge ${x.free?'b-green':'b-pink'}" style="margin-right:6px">${x.label}: ${x.free?'livre':'ocupada — '+esc(x.busy)}</span>`).join('');}catch{}};
    ['place','date','start_time','end_time'].forEach(k=>F[k].addEventListener('change',rooms));
    drawParts();rooms();PF.icons();
    m.el.querySelector('#f').onsubmit=async e=>{e.preventDefault();const b=m.el.querySelector('#save');b.disabled=true;
      const body={id:mt.id,...Object.fromEntries(new FormData(e.target)),participants:parts};
      try{const r=await PF.api('/api/meetings',{method:'POST',body});m.close();PF.toast('Reunião salva.','ok');onDone&&onDone(r.id);}catch(x){PF.toast(x.message,'err');b.disabled=false;}};
    const del=m.el.querySelector('#del');if(del)del.onclick=async()=>{if(!confirm('Cancelar (apagar) esta reunião?'))return;try{await PF.api('/api/meetings',{method:'DELETE',body:{id:mt.id}});m.close();PF.toast('Reunião cancelada.','ok');onDone&&onDone();}catch(x){PF.toast(x.message,'err');}};
  }

  async function ata(id,{onDone}={}){
    let D;
    const m=PF.modal('<div class="empty"><i data-lucide="loader"></i></div>',{side:true,wide:true});m.el.style.width='min(820px,100%)';
    async function load(){try{D=await PF.api('/api/meetings?id='+encodeURIComponent(id));}catch(e){PF.toast(e.message,'err');m.close();return;}draw();}
    function draw(){
      const mt=D.meeting;
      m.el.innerHTML=`<div class="modal-head"><div><h3>Ata — ${esc(mt.title)}</h3><p class="muted small">${mt.date.split('-').reverse().join('/')} · ${mt.start_time}–${mt.end_time}${mt.client_name?' · '+esc(mt.client_name):''}${mt.minutes_updated_by?' · editada por '+esc(mt.minutes_updated_by):''}</p></div><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
        <form class="stack" id="f">
          <label class="field"><span>Resumo (é o que vai para o cliente)</span><textarea class="input" name="minutes_summary" style="min-height:110px" placeholder="Principais pontos e próximos passos">${esc(mt.minutes_summary)}</textarea></label>
          <label class="field"><span>Texto completo da ata (cole aqui o que foi feito fora do sistema — fica só para a equipe)</span><textarea class="input" name="minutes_text" style="min-height:160px">${esc(mt.minutes_text)}</textarea></label>
          <div class="field"><span>Anexos (PDF, PNG, JPG)</span>
            ${D.files.map(f=>`<div class="li"><i data-lucide="${/pdf/i.test(f.url.slice(0,40))||/\.pdf/i.test(f.name)?'file-text':'image'}"></i><div class="t"><b>${esc(f.name)}</b><span>${esc(f.created_by)}</span></div><a class="btn btn-ghost btn-sm" href="${esc(f.url)}" target="_blank" rel="noopener">Ver</a><a class="btn btn-ghost btn-sm" href="${esc(f.url)}" download="${esc(f.name)}">Baixar</a><button type="button" class="icon-btn" data-fd="${f.id}"><i data-lucide="trash-2"></i></button></div>`).join('')||'<span class="muted small">Nenhum anexo.</span>'}
            <div class="row wrap" style="margin-top:8px"><button type="button" class="btn btn-ghost btn-sm" id="up"><i data-lucide="upload"></i>Anexar arquivo</button><input type="file" id="file" accept="application/pdf,image/png,image/jpeg" hidden>
              <input class="input" id="lnk" placeholder="ou link https://" style="flex:1;min-width:160px"><input class="input" id="lnkN" placeholder="Nome" style="width:140px"><button type="button" class="btn btn-ghost btn-sm" id="addL">Adicionar link</button></div></div>
          ${D.tasks.length?`<div class="field"><span>Tarefas criadas nesta reunião</span>${D.tasks.map(t=>`<div class="li"><div class="t"><b>${esc(t.title)}</b></div>${PF.taskStage?PF.taskStage(t.stage):t.stage}</div>`).join('')}</div>`:''}
          <div class="modal-foot">${mt.client_id?'<button type="button" class="btn btn-ghost" id="share" style="margin-right:auto"><i data-lucide="share-2"></i>Compartilhar com o cliente</button>':''}<button type="button" class="btn btn-ghost" data-close>Fechar</button><button class="btn btn-primary"><i data-lucide="save"></i>Salvar ata</button></div>
        </form>`;
      PF.icons();
      m.el.querySelectorAll('[data-close]').forEach(b=>b.onclick=m.close);
      m.el.querySelector('#f').onsubmit=async e=>{e.preventDefault();try{await PF.api('/api/meetings',{method:'PATCH',body:{id,action:'minutes',...Object.fromEntries(new FormData(e.target))}});PF.toast('Ata salva.','ok');onDone&&onDone();load();}catch(x){PF.toast(x.message,'err');}};
      const fi=m.el.querySelector('#file');m.el.querySelector('#up').onclick=()=>fi.click();
      fi.onchange=async()=>{const f=fi.files[0];if(!f)return;PF.toast('Enviando…');try{const url=await PF.upload(f,'ata');await PF.api('/api/meetings',{method:'PATCH',body:{id,action:'file_add',name:f.name,url,kind:f.type==='application/pdf'?'pdf':'imagem'}});PF.toast('Anexo adicionado.','ok');load();}catch(x){PF.toast(x.message,'err');}};
      m.el.querySelector('#addL').onclick=async()=>{try{await PF.api('/api/meetings',{method:'PATCH',body:{id,action:'file_add',url:m.el.querySelector('#lnk').value,name:m.el.querySelector('#lnkN').value}});load();}catch(x){PF.toast(x.message,'err');}};
      m.el.querySelectorAll('[data-fd]').forEach(b=>b.onclick=async()=>{if(!confirm('Remover anexo?'))return;await PF.api('/api/meetings',{method:'PATCH',body:{id,action:'file_del',file_id:b.dataset.fd}}).catch(x=>PF.toast(x.message,'err'));load();});
      const sh=m.el.querySelector('#share');if(sh)sh.onclick=async()=>{
        try{const pv=await PF.api('/api/meetings',{method:'PATCH',body:{id,action:'share',preview:true}});
          const m2=PF.modal(`<div class="modal-head"><div><h3>Compartilhar com o cliente</h3><p class="muted small">Este é exatamente o conteúdo que será enviado. O texto completo da ata não vai.</p></div><button class="icon-btn" data-close><i data-lucide="x"></i></button></div>
            <div class="card flat small" style="white-space:pre-wrap;line-height:1.55">${esc(pv.text)}</div>
            <label class="field" style="margin-top:12px"><span>Email do cliente</span><input class="input" id="em" value="${esc(pv.to)}"></label>
            <div class="modal-foot"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-ghost" data-v="email"><i data-lucide="mail"></i>Enviar por email</button><button class="btn btn-primary" data-v="whatsapp"><i data-lucide="message-circle"></i>Enviar pelo WhatsApp</button></div>`,{wide:true});
          m2.el.querySelectorAll('[data-v]').forEach(b=>b.onclick=async()=>{try{const r=await PF.api('/api/meetings',{method:'PATCH',body:{id,action:'share',via:b.dataset.v,to:m2.el.querySelector('#em').value}});
            if(b.dataset.v==='whatsapp'){const f=(r.phone||'').replace(/\D/g,'');window.open(`https://wa.me/${f?(f.length<=11?'55'+f:f):''}?text=${encodeURIComponent(r.text)}`,'_blank');}
            PF.toast('Ata compartilhada.','ok');m2.close();onDone&&onDone();}catch(x){PF.toast(x.message,'err');}});
        }catch(x){PF.toast(x.message,'err');}};
    }
    load();
  }
  PF.Reuniao={form,ata};
})();
