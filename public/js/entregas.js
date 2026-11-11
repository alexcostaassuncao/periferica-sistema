/* "O que o plano inclui" — entregas por categoria (os mesmos dados na ficha do cliente e na Gestão).
   PF.Entregas.editor(el, clientId, {onSaved})   editar quantidade e frequência (Por mês / Por semana)
   PF.Entregas.mes(el, clientId, {editHref})     total previsto no mês, com a conta e troca de mês */
(function(){
  const esc=PF.esc;
  const MES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const mLabel=m=>{const [y,mm]=m.split('-');return MES[+mm-1].replace(/^./,c=>c.toUpperCase())+' de '+y;};
  const shift=(m,n)=>{const [y,mm]=m.split('-').map(Number);const d=new Date(y,mm-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');};

  async function editor(el,clientId,{onSaved}={}){
    let D;try{D=await PF.api('/api/clients/plan?client='+encodeURIComponent(clientId));}catch(e){el.innerHTML=`<p class="muted small">${esc(e.message)}</p>`;return;}
    el.innerHTML=`<div class="table-wrap"><table class="tbl"><thead><tr><th>Categoria</th><th style="width:120px">Quantidade</th><th style="width:170px">Frequência</th></tr></thead><tbody>
      ${D.items.map(i=>`<tr><td><b>${i.label}</b> <span class="muted small">(${i.unit})</span></td>
        <td><input class="input" type="number" min="0" max="999" data-q="${i.key}" value="${i.qty}" style="padding:7px 10px"></td>
        <td><select class="select-in" data-f="${i.key}" style="padding:7px 30px 7px 10px"><option value="mes" ${i.freq==='mes'?'selected':''}>Por mês</option><option value="semana" ${i.freq==='semana'?'selected':''}>Por semana</option></select></td></tr>`).join('')}
      </tbody></table></div>
      <div class="row between wrap" style="margin-top:10px"><span class="muted tiny">${D.items.find(i=>i.updated_by)?'Atualizado por '+esc(D.items.find(i=>i.updated_by).updated_by):'Deixe 0 nas categorias que o plano não inclui.'}</span>
      <button class="btn btn-primary btn-sm" id="entSave"><i data-lucide="save"></i>Salvar entregas</button></div>`;
    PF.icons();
    el.querySelector('#entSave').onclick=async()=>{
      const items=D.items.map(i=>({key:i.key,qty:el.querySelector(`[data-q="${i.key}"]`).value,freq:el.querySelector(`[data-f="${i.key}"]`).value}));
      try{await PF.api('/api/clients/plan',{method:'POST',body:{action:'save',client_id:clientId,items}});PF.toast('Entregas do plano salvas.','ok');onSaved&&onSaved();}catch(e){PF.toast(e.message,'err');}
    };
  }

  async function mes(el,clientId,{editHref=''}={}){
    let month=sessionStorage.getItem('pf-ent-mes')||new Date().toISOString().slice(0,7);
    async function draw(){
      let D;try{D=await PF.api(`/api/clients/plan?client=${encodeURIComponent(clientId)}&month=${month}`);}catch(e){el.innerHTML=`<p class="muted small">${esc(e.message)}</p>`;return;}
      const temSemanal=D.totals.some(t=>t.freq==='semana');
      const un=t=>t.qty===1?t.unit.replace(/s$/,""):t.unit, ut=t=>t.total===1?t.unit.replace(/s$/,""):t.unit;
      el.innerHTML=`
        <div class="row between wrap" style="gap:8px;margin-bottom:10px">
          <div class="row"><button class="icon-btn" id="mPrev" aria-label="Mês anterior"><i data-lucide="chevron-left"></i></button><b style="min-width:150px;text-align:center">${mLabel(month)}</b><button class="icon-btn" id="mNext" aria-label="Próximo mês"><i data-lucide="chevron-right"></i></button></div>
          <label class="row small" title="Calendário de produção: vale para todos os clientes">Semanas de produção:
            <input class="input" type="number" min="1" max="6" id="wk" value="${D.weeks}" style="width:64px;padding:6px 8px">
            <button class="btn btn-ghost btn-sm" id="wkSave">Salvar</button></label>
        </div>
        <p class="muted tiny" style="margin:-4px 0 10px">${D.weeksCustom?`Definido por ${esc(D.weeksBy)} para ${mLabel(month)}.`:`Padrão: ${D.weeks} semanas (segundas-feiras do mês). Altere se o mês tiver outra quantidade de semanas de produção.`}</p>
        ${D.totals.length?`<div class="table-wrap"><table class="tbl"><thead><tr><th>O que o plano inclui</th><th>Frequência</th><th>Conta</th><th class="right">Total no mês</th></tr></thead><tbody>
          ${D.totals.map(t=>`<tr><td><b>${t.label}</b></td><td>${t.qty} ${un(t)} ${t.freq==='semana'?'por semana':'por mês'}</td><td class="small muted">${t.conta}</td><td class="right"><b style="font-size:16px">${t.total}</b> <span class="muted small">${ut(t)}</span></td></tr>`).join('')}
        </tbody></table></div>${temSemanal?'':'<p class="muted tiny" style="margin-top:6px">Todas as entregas são mensais: o total não muda de um mês para o outro.</p>'}`
        :`<div class="empty" style="padding:18px"><i data-lucide="package-open"></i><div>As entregas do plano ainda não foram definidas.</div>${editHref?`<a class="btn btn-ghost btn-sm" href="${editHref}" style="margin-top:10px">Definir entregas</a>`:''}</div>`}`;
      PF.icons();
      el.querySelector('#mPrev').onclick=()=>{month=shift(month,-1);sessionStorage.setItem('pf-ent-mes',month);draw();};
      el.querySelector('#mNext').onclick=()=>{month=shift(month,1);sessionStorage.setItem('pf-ent-mes',month);draw();};
      el.querySelector('#wkSave').onclick=async()=>{try{await PF.api('/api/clients/plan',{method:'POST',body:{action:'weeks',month,weeks:el.querySelector('#wk').value}});PF.toast('Semanas de produção salvas para '+mLabel(month)+'.','ok');draw();}catch(e){PF.toast(e.message,'err');}};
    }
    draw();
  }
  PF.Entregas={editor,mes};
})();
