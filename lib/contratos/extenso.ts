// Números e valores por extenso, no estilo dos contratos da Periférica ("Um mil setecentos e noventa reais").

const UN=['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const DEZ=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
const CEN=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];

function ate999(n:number):string{
  if(n<20)return UN[n];
  if(n<100){const d=Math.floor(n/10),u=n%10;return DEZ[d]+(u?' e '+UN[u]:'');}
  if(n===100)return 'cem';
  const c=Math.floor(n/100),r=n%100;
  return CEN[c]+(r?' e '+ate999(r):'');
}

// Número inteiro por extenso (até 999.999.999).
export function numeroExtenso(n:number):string{
  n=Math.floor(Math.abs(n));
  if(n<1000)return ate999(n);
  const partes:[number,string,string][]=[[Math.floor(n/1e6)%1000,'milhão','milhões'],[Math.floor(n/1000)%1000,'mil','mil'],[n%1000,'','']];
  const ditos=partes.filter(([v])=>v>0).map(([v,s,p])=>v===1&&p==='mil'?'um mil':(ate999(v)+(s?' '+(v===1?s:p):'')));
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda (ex.: "mil e cem", "dois mil e cinquenta")
  const ultimo=n%1000;
  if(ditos.length>1&&ultimo>0&&(ultimo<100||ultimo%100===0)){const u=ditos.pop()!;return ditos.join(' ')+' e '+u;}
  return ditos.join(' ');
}

// "R$ 2.990,00 (dois mil, novecentos e noventa reais)"
export function reaisExtenso(valor:number):string{
  const cents=Math.round(valor*100),r=Math.floor(cents/100),c=cents%100;
  const partes:string[]=[];
  if(r>0)partes.push(numeroExtenso(r)+(r===1?' real':(r%1000000===0?' de reais':' reais')));
  if(c>0)partes.push(numeroExtenso(c)+(c===1?' centavo':' centavos'));
  const txt=partes.join(' e ')||'zero reais';
  return txt.charAt(0).toUpperCase()+txt.slice(1);
}

export function brl(valor:number){return 'R$ '+valor.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
export const valorComExtenso=(v:number)=>`${brl(v)} (${reaisExtenso(v)})`;
export const numeroComExtenso=(n:number)=>`${n} (${numeroExtenso(n)})`;

// Aceita "2.990,00", "2990", "R$ 1.790,50" ou número.
export function parseValor(v:unknown):number{
  if(typeof v==='number')return v;
  const s=String(v??'').replace(/[^\d,.-]/g,'');
  if(!s)return 0;
  const n=s.includes(',')?Number(s.replace(/\./g,'').replace(',','.')):Number(s);
  return Number.isFinite(n)?n:0;
}

const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
// "2026-11-05" → "05 de novembro de 2026"
export function dataExtenso(iso:string){const [y,m,d]=iso.split('-').map(Number);return `${String(d).padStart(2,'0')} de ${MESES[m-1]} de ${y}`;}
// "2026-11-05" → "05/11/2026"
export function dataBr(iso:string){if(!iso)return '';const [y,m,d]=iso.split('-');return `${d}/${m}/${y}`;}
