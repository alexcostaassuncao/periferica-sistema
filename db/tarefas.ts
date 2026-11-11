import {database} from './raw';

/* Fluxo da tarefa (o MESMO registro do começo ao fim):
   gestao → copy → design → revisao → cliente → aprovada
   Revisão pode devolver para copy ou design (com motivo). Se o cliente pedir ajustes, volta para revisao. */

export const STAGES=['gestao','copy','design','revisao','cliente','aprovada'] as const;
export const STAGE_LABEL:Record<string,string>={gestao:'Gestão',copy:'Copy',design:'Design',revisao:'Revisão',cliente:'Com o cliente',aprovada:'Aprovada'};
export const CATEGORIES=['social','campanha'],FORMATS=['feed','stories','reels'],CHANNELS=['instagram','facebook','ambos'];
// Papel da equipe do cliente que recebe a tarefa em cada etapa (para sugerir o responsável).
export const STAGE_ROLE:Record<string,string>={copy:'copy',design:'design',revisao:'consultora',gestao:'consultora'};

export type U={id:string;name:string;admin:boolean;access:string;areas:string[];squads:string[]};
const has=(u:U,a:string)=>u.admin||u.areas.includes(a);
export const canSeeTasks=(u:U|null)=>!!u&&['gestao','copy','design','revisao'].some(a=>has(u,a));

/* Regra de carteira: quem tem carteiras (C1, C2...) no cadastro vê os clientes dessas carteiras,
   os clientes em que está na equipe interna e as tarefas em que é responsável. Sem carteira = vê todas. */
export function visibilitySql(u:U,alias='t'){
  if(u.admin||!u.squads.length)return {sql:'1=1',args:[] as any[]};
  return {
    sql:`(c.squad IN (${u.squads.map(()=>'?').join(',')}) OR EXISTS (SELECT 1 FROM client_team ct WHERE ct.client_id=c.id AND ct.user_id=?) OR ${alias}.responsible_id=? OR ${alias}.assignee_id=? OR ${alias}.created_by=?)`,
    args:[...u.squads,u.id,u.id,u.id,u.id],
  };
}

// O que o usuário pode fazer com a tarefa na etapa atual (validado no servidor; a tela só esconde botões).
export function taskCan(u:U,t:any){
  const g=has(u,'gestao'),cp=has(u,'copy'),ds=has(u,'design'),rv=has(u,'revisao');
  const s=t.stage;
  return {
    editBase:g&&s!=='aprovada',                                   // título, descrição, estratégia, prazo, formato...
    editCopy:(cp||g)&&['gestao','copy'].includes(s),              // briefing complementar, referências, texto da arte, legenda
    addRefs:(cp||g)&&['gestao','copy','design'].includes(s),
    addVersion:ds&&s==='design',
    sendCopy:g&&s==='gestao',
    sendDesign:cp&&s==='copy',
    sendReview:ds&&s==='design',
    adjust:rv&&s==='revisao',
    share:rv&&['revisao','cliente'].includes(s),
    clientResult:(rv||g)&&s==='cliente',
    comment:true,
    delete:g&&s==='gestao',
  };
}

export async function logTask(taskId:string,u:{id:string;name:string}|null,action:string,o:{from?:string;to?:string;toUser?:string;reason?:string}={}){
  await database().prepare('INSERT INTO task_history (id,task_id,action,from_stage,to_stage,to_user,reason,by_id,by_name,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),taskId,action,o.from||'',o.to||'',o.toUser||'',(o.reason||'').slice(0,2000),u?.id||'',u?.name||'Cliente',Date.now()).run();
}

// Link https permitido para referências e entregas (Cloudinary ou link público). Imagens pequenas podem vir embutidas (sem Cloudinary).
export function cleanUrl(v:unknown){
  const u=String(v||'').trim();
  if(/^https:\/\/[^\s]+$/.test(u)&&u.length<=1500)return u;
  if(/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(u)&&u.length<=900_000)return u;
  return '';
}
