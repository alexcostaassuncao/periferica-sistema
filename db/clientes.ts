import {database} from './raw';

// Registra um acontecimento no histórico do cliente (contatos, reuniões, notas e ações do sistema).
export async function logEvent(clientId:string,kind:'contato'|'reuniao'|'nota'|'sistema',title:string,body='',user?:{id:string;name:string}|null,happenedAt?:string){
  await database().prepare('INSERT INTO client_events (id,client_id,kind,title,body,happened_at,author_id,author_name,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),clientId,kind,title.slice(0,200),body.slice(0,4000),happenedAt||new Date().toISOString(),user?.id||'',user?.name||'Sistema',Date.now()).run();
}

// Papéis da equipe interna de cada cliente.
export const TEAM_ROLES:[string,string][]=[['consultora','Consultora'],['copy','Copy'],['design','Design'],['trafego','Tráfego'],['comercial','Comercial']];

// Checklist padrão do onboarding (10 dias úteis). role = quem executa.
export const ONBOARDING_STEPS:{title:string;desc:string;role:string;prazo:string;items:string[]}[]=[
  {title:'Recepção e agendamento',desc:'Criar grupo, enviar boas-vindas e agendar a reunião inicial.',role:'consultora',prazo:'Dia 1',
    items:['Criar grupo no WhatsApp com o cliente','Enviar mensagem de boas-vindas','Agendar a reunião de onboarding']},
  {title:'Reunião de onboarding',desc:'Entendimento do negócio, objetivos, necessidades, coleta de materiais e acessos.',role:'consultora',prazo:'Até o dia 3',
    items:['Realizar a reunião de onboarding','Registrar a ata da reunião','Coletar logo, fotos e materiais','Cadastrar os acessos no cofre de senhas']},
  {title:'Estratégia e configurações',desc:'Copy, design e tráfego trabalham em paralelo na proposta estratégica e nas configurações.',role:'copy',prazo:'Dias 3 a 7',
    items:['Linha editorial (Copy)','Identidade visual do feed (Design)','Configurar BM, pixel e contas de anúncio (Tráfego)','Conectar Instagram e Facebook no sistema']},
  {title:'Apresentação estratégica',desc:'Consolidação da estratégia em uma apresentação padronizada para o cliente.',role:'consultora',prazo:'Dias 7 a 9',
    items:['Montar a apresentação estratégica','Revisão da consultora']},
  {title:'Ativação',desc:'Apresentação ao cliente, registro dos alinhamentos e liberação para a rotina de Gestão.',role:'consultora',prazo:'Até o dia 10',
    items:['Apresentar a estratégia ao cliente','Registrar os alinhamentos com o cliente']},
];
// Etapas que precisam estar 100% para liberar "Enviar para Gestão" (apresentação + alinhamentos).
export const STEPS_REQUIRED_FOR_GESTAO=[3,4];

// Soma 10 dias úteis a partir de uma data.
export function addBusinessDays(from:number,days:number){
  const d=new Date(from);let n=0;
  while(n<days){d.setDate(d.getDate()+1);const w=d.getDay();if(w!==0&&w!==6)n++;}
  return d.getTime();
}

// Progresso do onboarding = itens concluídos / total de itens (a mesma conta em todas as telas).
export async function onboardingProgress(ids:string[]){
  if(!ids.length)return {} as Record<string,{done:number;total:number;pct:number}>;
  const rows=(await database().prepare(`SELECT onboarding_id,COUNT(*) AS total,SUM(done) AS done FROM onboarding_items WHERE onboarding_id IN (${ids.map(()=>'?').join(',')}) GROUP BY onboarding_id`).bind(...ids).all()).results as any[];
  return Object.fromEntries(rows.map(r=>[r.onboarding_id,{done:Number(r.done)||0,total:Number(r.total)||0,pct:r.total?Math.round((Number(r.done)||0)/Number(r.total)*100):0}]));
}
