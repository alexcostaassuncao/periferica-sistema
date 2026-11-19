import {database} from './raw';

// As 4 categorias de entrega dos planos de Gestão.
export const DELIVERABLES:{key:string;label:string;unit:string}[]=[
  {key:'social',label:'Social Media',unit:'posts'},
  {key:'campanha',label:'Campanha',unit:'criativos'},
  {key:'video_organico',label:'Vídeo orgânico',unit:'vídeos'},
  {key:'video_campanha',label:'Vídeo de campanha',unit:'vídeos'},
];
export const FREQS=['mes','semana'];

// Semanas de produção padrão de um mês = quantas segundas-feiras ele tem (4 ou 5).
export function defaultWeeks(month:string){
  const [y,m]=month.split('-').map(Number);let n=0;
  for(let d=1;d<=new Date(y,m,0).getDate();d++)if(new Date(y,m-1,d).getDay()===1)n++;
  return n;
}
export async function weeksOf(month:string){
  const r:any=await database().prepare('SELECT weeks,updated_by FROM production_weeks WHERE month=?').bind(month).first();
  return r?{weeks:Number(r.weeks),custom:true,updated_by:r.updated_by}:{weeks:defaultWeeks(month),custom:false,updated_by:''};
}
export async function deliverablesOf(clientId:string){
  const rows=(await database().prepare('SELECT category,qty,freq,updated_by,updated_at FROM client_deliverables WHERE client_id=?').bind(clientId).all()).results as any[];
  return DELIVERABLES.map(d=>{const r=rows.find(x=>x.category===d.key);return {...d,qty:r?Number(r.qty):0,freq:r?.freq||'mes',updated_by:r?.updated_by||'',updated_at:r?.updated_at||null};});
}
// Total previsto no mês: mensal = quantidade; semanal = quantidade × semanas de produção.
export function monthTotals(items:{key:string;label:string;unit:string;qty:number;freq:string}[],weeks:number){
  return items.filter(i=>i.qty>0).map(i=>({...i,total:i.freq==='semana'?i.qty*weeks:i.qty,
    conta:i.freq==='semana'?`${i.qty} por semana × ${weeks} semanas = ${i.qty*weeks}`:`${i.qty} por mês (fixo)`}));
}
// Salva a partir dos campos do contrato (entrega_<categoria>_qtd / entrega_<categoria>_freq).
export async function saveFromContractData(clientId:string,data:any,by:string){
  const ops=[];const db=database();
  for(const d of DELIVERABLES){
    const qty=Math.max(0,Math.min(999,Math.floor(Number(data?.[`entrega_${d.key}_qtd`])||0)));
    const freq=FREQS.includes(data?.[`entrega_${d.key}_freq`])?data[`entrega_${d.key}_freq`]:'mes';
    if(data?.[`entrega_${d.key}_qtd`]===undefined)continue;
    ops.push(db.prepare('INSERT INTO client_deliverables (client_id,category,qty,freq,updated_by,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(client_id,category) DO UPDATE SET qty=excluded.qty,freq=excluded.freq,updated_by=excluded.updated_by,updated_at=excluded.updated_at')
      .bind(clientId,d.key,qty,freq,by,Date.now()));
  }
  if(ops.length)await db.batch(ops);
  return ops.length;
}
