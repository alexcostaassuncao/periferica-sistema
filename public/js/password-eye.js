// Botão de "olhinho" em todo campo de senha: mostra/oculta o que foi digitado para conferir antes de salvar ou entrar.
(()=>{
const EYE='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/></svg>';
const style=document.createElement('style');
style.textContent='.pw-wrap{position:relative;display:block}.pw-wrap>input{padding-right:46px!important}button.pw-eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:34px;height:34px;margin:0;padding:0;border:0;border-radius:6px;background:transparent;box-shadow:none;color:inherit;opacity:.55;display:grid;place-items:center;cursor:pointer;letter-spacing:0}button.pw-eye:hover{opacity:1;background:transparent}button.pw-eye:focus-visible{opacity:1;outline:2px solid #ff5000;outline-offset:0}';
document.head.append(style);
function setVisible(input,button,visible){input.type=visible?'text':'password';button.innerHTML=visible?EYE_OFF:EYE;button.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha');button.title=button.getAttribute('aria-label');button.setAttribute('aria-pressed',String(visible));}
function attach(input){
  if(input.dataset.pwEye)return;input.dataset.pwEye='1';
  const wrap=document.createElement('span');wrap.className='pw-wrap';
  wrap.style.marginTop=getComputedStyle(input).marginTop;input.style.marginTop='0';
  input.before(wrap);wrap.append(input);
  const button=document.createElement('button');button.type='button';button.className='pw-eye';wrap.append(button);
  setVisible(input,button,false);
  button.onclick=()=>{setVisible(input,button,input.type==='password');input.focus();};
  // Volta a esconder quando o formulário é limpo ou a janela de cadastro fecha.
  input.form?.addEventListener('reset',()=>setVisible(input,button,false));
  input.closest('dialog')?.addEventListener('close',()=>setVisible(input,button,false));
}
document.querySelectorAll('input[type="password"]').forEach(attach);
})();
