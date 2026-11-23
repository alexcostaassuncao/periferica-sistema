// Importa do eKyte os clientes ativos e as tarefas abertas (ativas e pausadas) para o sistema.
//   npm run ekyte:import -- --dry-run   → só mostra o que faria
//   npm run ekyte:import                → grava
// Precisa de EKYTE_MCP_URL no .env.local (endereço do MCP do eKyte com o token).
// Usa o mesmo banco do sistema: TURSO_DATABASE_URL se estiver definida, senão o arquivo local.
// Pode rodar de novo: clientes e tarefas já importados (pelo código do eKyte) não são duplicados nem sobrescritos.
import {createClient} from '@libsql/client';

const DRY=process.argv.includes('--dry-run');
const MCP=process.env.EKYTE_MCP_URL;
if(!MCP){console.error('✖ Defina EKYTE_MCP_URL no .env.local.');process.exit(1);}

let rpcId=0;
async function ekyte(name,args={}){
  const r=await fetch(MCP,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:++rpcId,method:'tools/call',params:{name,arguments:args}})});
  const j=await r.json();
  if(j.error||j.result?.isError)throw Error(`eKyte ${name}: ${JSON.stringify(j.error||j.result.content).slice(0,300)}`);
  const d=j.result.structuredContent;
  return Array.isArray(d)?d:(d?.items||d?.result||Object.values(d||{}).find(Array.isArray)||d);
}
const pool=async(items,n,fn)=>{const out=[];let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length){const k=i++;out[k]=await fn(items[k]);}}));return out;};

// ---------- Correspondência eKyte → sistema ----------
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
// Etapa do eKyte → etapa do sistema (+ situação com o cliente)
const PHASE={
  'briefing':['gestao'],'escopo':['gestao'],'analise':['gestao'],'informacoes/materiais':['gestao'],'reuniao de apresentacao':['gestao'],
  'onboarding':['gestao'],'pre-onboarding':['gestao'],'apresentacao estrategica':['gestao'],'pagamento e frete':['gestao'],
  'redacao':['copy'],
  'captacao':['video'],'videomaker':['video'],'captacao e edicao de videos ou fotos':['video'],
  'design':['design'],'criacao':['design'],'criacao interna':['design'],
  'revisao':['revisao'],'ajustes':['revisao','ajustes'],
  'aprovacao cliente':['cliente','aguardando'],
  'aprovacao trafego':['aprovada','aprovada'],'publicacao campanha':['aprovada','aprovada'],'publicacao organica':['aprovada','aprovada'],
  'monitoramento':['aprovada','aprovada'],'concluido':['aprovada','aprovada'],'ativacao concluida':['aprovada','aprovada'],
};
function category(type){
  const n=norm(type);
  if(/video/.test(n))return /campanha/.test(n)?'video_campanha':'video_organico';
  if(/campanha|trafego|ads|oferta|impulsionar/.test(n))return 'campanha';
  return 'social';
}
const format=(type,cat)=>/stor/.test(norm(type))?'stories':cat.startsWith('video')?'reels':'feed';
function channels(list){
  const n=norm((list||[]).map(c=>c.name).join(' '));
  const ig=/instagram|@/.test(n),fb=/facebook|pagina/.test(n);
  return ig&&!fb?'instagram':fb&&!ig?'facebook':'ambos';
}
const SQUAD={'C1 - JULIA':'C1','C2 - CAROL':'C2','C3 - BRUNA':'C3','C4 - MANUELLA':'C4'};

// ---------- Busca no eKyte ----------
console.log('Buscando clientes ativos no eKyte...');
const workspaces=(await ekyte('list_short_workspaces',{active:1})).map(w=>({id:String(w.id),name:String(w.name).trim()}));
console.log(`  ${workspaces.length} clientes ativos.`);

console.log('Buscando tarefas abertas (uma consulta por cliente)...');
const tasks=(await pool(workspaces,6,async w=>{
  const t=await ekyte('list_tasks',{situation:'10,20',limit:200,workspaceId:w.id});
  if(t.length>=200)console.warn(`  ⚠ ${w.name}: 200 tarefas (limite do eKyte), pode haver mais.`);
  return t;
})).flat();
console.log(`  ${tasks.length} tarefas abertas.`);

// Carteira de cada cliente: o squad das tarefas dele (abertas e concluídas recentemente).
console.log('Buscando carteiras (squads)...');
const squads=await ekyte('list_squads',{});
const since=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
const wsSquad={};
for(const sq of squads){
  const code=SQUAD[String(sq.name).trim()];if(!code)continue;
  const lists=await Promise.all([ekyte('list_tasks',{squadId:String(sq.id),situation:'10,20',limit:200}),ekyte('list_tasks',{squadId:String(sq.id),situation:'30',concludedDateStart:since,limit:200})]);
  for(const t of lists.flat()){const c=(wsSquad[t.workspaceId]??={});c[code]=(c[code]||0)+1;}
}
const squadOf=id=>{const c=wsSquad[id];if(!c)return '';return Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];};

// ---------- Grava no sistema ----------
const db=createClient({url:process.env.TURSO_DATABASE_URL||'file:periferica-local.db',authToken:process.env.TURSO_AUTH_TOKEN||undefined});
console.log(`\nBanco: ${process.env.TURSO_DATABASE_URL?'Turso (equipe)':'local (periferica-local.db)'}${DRY?' — SIMULAÇÃO, nada será gravado':''}`);
const users=Object.fromEntries((await db.execute('SELECT id,lower(email) AS email FROM users')).rows.map(r=>[r.email,r.id]));
const byEkyte=Object.fromEntries((await db.execute('SELECT id,ekyte_id FROM clients WHERE ekyte_id IS NOT NULL')).rows.map(r=>[r.ekyte_id,r.id]));
const byName=Object.fromEntries((await db.execute('SELECT id,name,ekyte_id FROM clients')).rows.map(r=>[norm(r.name),r]));
const doneTasks=new Set((await db.execute('SELECT ekyte_id FROM tasks WHERE ekyte_id IS NOT NULL')).rows.map(r=>r.ekyte_id));

const ops=[],now=Date.now(),nowIso=new Date().toISOString(),clientId={};
const stat={clientesNovos:0,clientesLigados:0,clientesJaImportados:0,tarefasNovas:0,tarefasJaImportadas:0,semEtapa:{},semUsuario:new Set(),etapas:{}};

for(const w of workspaces){
  if(byEkyte[w.id]){clientId[w.id]=byEkyte[w.id];stat.clientesJaImportados++;continue;}
  const same=byName[norm(w.name)];
  if(same&&!same.ekyte_id){ // cliente que já existia no sistema com o mesmo nome: só liga ao eKyte
    clientId[w.id]=same.id;stat.clientesLigados++;
    ops.push({sql:"UPDATE clients SET ekyte_id=?,squad=CASE WHEN COALESCE(squad,'')='' THEN ? ELSE squad END WHERE id=?",args:[w.id,squadOf(w.id),same.id]});
    continue;
  }
  const id=crypto.randomUUID();clientId[w.id]=id;stat.clientesNovos++;
  ops.push({sql:"INSERT INTO clients (id,name,squad,status,phase,created_at,ekyte_id) VALUES (?,?,?,'ativo','gestao',?,?)",args:[id,w.name,squadOf(w.id),nowIso,w.id]});
}

for(const t of tasks){
  const eid=String(t.id);
  if(doneTasks.has(eid)){stat.tarefasJaImportadas++;continue;}
  const phase=String(t.phase?.name||'').trim();
  const map=PHASE[norm(phase)];
  if(!map)stat.semEtapa[phase]=(stat.semEtapa[phase]||0)+1;
  const [stage,clientStatus]=map||['gestao'];
  stat.etapas[stage]=(stat.etapas[stage]||0)+1;
  const type=t.ctcTaskType?.name||'',cat=category(type);
  const exec=t.executor?.email?users[t.executor.email.toLowerCase()]||'':'';
  if(t.executor?.email&&!exec)stat.semUsuario.add(t.executor.email.toLowerCase());
  const desc=[
    `Importada do eKyte (tarefa #${eid}).`,
    `Etapa no eKyte: ${phase||'—'}${t.situation===20?' · PAUSADA':''}`,
    `Tipo: ${type||'—'}`,
    t.ctcTaskProject?.name&&`Projeto: ${t.ctcTaskProject.name}`,
    t.executor?.userName&&`Executor no eKyte: ${t.executor.userName}`,
  ].filter(Boolean).join('\n');
  const id=crypto.randomUUID(),created=Date.parse(t.creationDate)||now;
  ops.push({sql:`INSERT INTO tasks (id,client_id,title,description,responsible_id,assignee_id,due_date,category,format,channels,stage,client_status,created_by,created_at,updated_at,ekyte_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'ekyte',?,?,?)`,
    args:[id,clientId[t.workspaceId],String(t.title||'Sem título').trim().slice(0,160),desc,exec,exec,String(t.currentDueDate||'').slice(0,10),cat,format(type,cat),channels(t.channels),stage,clientStatus||'',created,now,eid]});
  ops.push({sql:"INSERT INTO task_history (id,task_id,action,from_stage,to_stage,to_user,reason,by_id,by_name,created_at) VALUES (?,?,'importada','',?,?,?,'ekyte','eKyte',?)",
    args:[crypto.randomUUID(),id,stage,t.executor?.userName||'',`Importada do eKyte (etapa: ${phase}${t.situation===20?', pausada':''})`,now]});
  stat.tarefasNovas++;
}

console.log(`Clientes: ${stat.clientesNovos} novos, ${stat.clientesLigados} já existiam (ligados pelo nome), ${stat.clientesJaImportados} já importados antes.`);
console.log(`Tarefas: ${stat.tarefasNovas} novas, ${stat.tarefasJaImportadas} já importadas antes.`);
console.log('Por etapa do sistema:',stat.etapas);
if(Object.keys(stat.semEtapa).length)console.log('⚠ Etapas do eKyte sem correspondência (entraram em Gestão):',stat.semEtapa);
if(stat.semUsuario.size)console.log(`⚠ ${stat.semUsuario.size} executores do eKyte sem usuário no sistema (tarefa fica sem responsável): ${[...stat.semUsuario].join(', ')}`);

if(DRY){console.log('\nSimulação concluída. Rode sem --dry-run para gravar.');process.exit(0);}
if(ops.length)await db.batch(ops,'write'); // tudo numa transação: ou entra tudo, ou nada
console.log('\n✔ Importação concluída.');
db.close();
