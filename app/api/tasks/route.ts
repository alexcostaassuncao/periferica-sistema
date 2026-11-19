import {database} from '../../../db/raw';
import {currentUser,sameOrigin} from '../../../lib/auth';
import {logEvent} from '../../../db/clientes';
import {mailReady,sendMail} from '../../../lib/mail';
import {sha256} from '../../../lib/session';
import {siteOrigin} from '../../../db/social';
import {CATEGORIES,CHANNELS,FORMATS,STAGE_LABEL,STAGE_ROLE,canSeeTasks,cleanUrl,logTask,taskCan,visibilitySql,type U} from '../../../db/tarefas';

const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const denied=(m='Você não tem acesso às tarefas.')=>json({error:m},403);
const s=(v:any,max:number)=>String(v??'').trim().slice(0,max);

// Carrega a tarefa respeitando a regra de carteira (quem não pode ver recebe "não encontrada").
async function loadTask(u:U,id:string){
  const vis=visibilitySql(u);
  return database().prepare(`SELECT t.*,c.name AS client_name,c.squad,c.phone AS client_phone,c.email AS client_email,c.contact_name AS client_contact
    FROM tasks t JOIN clients c ON c.id=t.client_id WHERE t.id=? AND ${vis.sql}`).bind(id,...vis.args).first<any>();
}
async function personName(id:string){
  if(!id)return '';
  if(id==='admin')return 'Administrador';
  const p:any=await database().prepare('SELECT name FROM users WHERE id=?').bind(id).first();
  return p?.name||'';
}
// Sugere quem recebe a tarefa na etapa: a pessoa daquele papel na equipe do cliente.
async function defaultAssignee(clientId:string,stage:string){
  const r:any=await database().prepare('SELECT user_id FROM client_team WHERE client_id=? AND role=?').bind(clientId,STAGE_ROLE[stage]||'').first();
  return r?.user_id||'';
}

export async function GET(req:Request){
  const u=currentUser(req) as U|null;
  if(!canSeeTasks(u))return denied();
  const q=new URL(req.url).searchParams,db=database();
  const id=q.get('id');
  if(id){
    const t=await loadTask(u!,id);
    if(!t)return json({error:'Tarefa não encontrada (ou fora da sua carteira).'},404);
    const [refs,versions,comments,history,team,meeting]=await Promise.all([
      db.prepare('SELECT * FROM task_refs WHERE task_id=? ORDER BY created_at').bind(id).all(),
      db.prepare('SELECT * FROM task_versions WHERE task_id=? ORDER BY version DESC').bind(id).all(),
      db.prepare('SELECT * FROM task_comments WHERE task_id=? ORDER BY created_at').bind(id).all(),
      db.prepare('SELECT * FROM task_history WHERE task_id=? ORDER BY created_at DESC').bind(id).all(),
      db.prepare('SELECT t.role,t.user_id,u.name FROM client_team t LEFT JOIN users u ON u.id=t.user_id WHERE t.client_id=?').bind(t.client_id).all(),
      t.meeting_id?db.prepare('SELECT id,title,date FROM meetings WHERE id=?').bind(t.meeting_id).first():null,
    ]);
    const {share_hash,...task}=t;
    return json({task:{...task,shared:!!share_hash,responsible_name:await personName(t.responsible_id),assignee_name:await personName(t.assignee_id)},
      refs:refs.results,versions:versions.results,comments:(comments.results as any[]).map(c=>({...c,mentions:JSON.parse(c.mentions||'[]')})),
      history:history.results,team:team.results,meeting,can:taskCan(u!,t),stageLabel:STAGE_LABEL});
  }
  // Lista com filtros combináveis
  const where:string[]=[],args:any[]=[];
  const vis=visibilitySql(u!);where.push(vis.sql);args.push(...vis.args);
  const stages=(q.get('stage')||'').split(',').filter(Boolean);
  if(stages.length){where.push(`t.stage IN (${stages.map(()=>'?').join(',')})`);args.push(...stages);}
  if(q.get('client')){where.push('t.client_id=?');args.push(q.get('client'));}
  if(q.get('squad')){where.push('c.squad=?');args.push(q.get('squad'));}
  if(q.get('category')){where.push('t.category=?');args.push(q.get('category'));}
  if(q.get('person')){where.push('(t.assignee_id=? OR t.responsible_id=?)');args.push(q.get('person'),q.get('person'));}
  if(q.get('mine')){where.push('(t.assignee_id=? OR t.responsible_id=?)');args.push(u!.id,u!.id);}
  const hoje=new Date().toISOString().slice(0,10);
  const due=q.get('due');
  if(due==='atrasadas'){where.push("t.due_date<>'' AND t.due_date<? AND t.stage NOT IN ('aprovada')");args.push(hoje);}
  if(due==='hoje'){where.push('t.due_date=?');args.push(hoje);}
  if(due==='semana'){const fim=new Date(Date.now()+7*86400000).toISOString().slice(0,10);where.push('t.due_date>=? AND t.due_date<=?');args.push(hoje,fim);}
  if(q.get('q')){where.push('(t.title LIKE ? OR c.name LIKE ?)');args.push('%'+q.get('q')+'%','%'+q.get('q')+'%');}
  const rows=(await db.prepare(`SELECT t.id,t.client_id,t.title,t.stage,t.category,t.format,t.channels,t.due_date,t.client_status,t.assignee_id,t.responsible_id,t.updated_at,t.meeting_id,
      c.name AS client_name,c.squad,
      (SELECT url FROM task_versions v WHERE v.task_id=t.id ORDER BY version DESC LIMIT 1) AS last_url,
      (SELECT kind FROM task_versions v WHERE v.task_id=t.id ORDER BY version DESC LIMIT 1) AS last_kind,
      (SELECT COUNT(*) FROM task_versions v WHERE v.task_id=t.id) AS versions,
      (SELECT COUNT(*) FROM task_comments m WHERE m.task_id=t.id) AS comments,
      (SELECT reason FROM task_history h WHERE h.task_id=t.id AND h.action='ajuste' ORDER BY created_at DESC LIMIT 1) AS last_adjust
    FROM tasks t JOIN clients c ON c.id=t.client_id WHERE ${where.join(' AND ')} ORDER BY CASE WHEN t.due_date='' THEN 1 ELSE 0 END, t.due_date, t.updated_at DESC LIMIT 500`).bind(...args).all()).results as any[];
  const names=Object.fromEntries(((await db.prepare('SELECT id,name FROM users').all()).results as any[]).map(p=>[p.id,p.name]));
  names.admin='Administrador';
  return json({tasks:rows.map(r=>({...r,assignee_name:names[r.assignee_id]||'',responsible_name:names[r.responsible_id]||''}))});
}

// Criar tarefa (Gestão)
export async function POST(req:Request){
  const u=currentUser(req) as U|null;
  if(!u||!(u.admin||u.areas.includes('gestao'))||!sameOrigin(req))return denied('Só a Gestão cria tarefas.');
  const p:any=await req.json().catch(()=>({}));
  const db=database();
  const client:any=await db.prepare('SELECT id,name FROM clients WHERE id=?').bind(p.client_id).first();
  if(!client)return json({error:'Escolha o cliente.'},400);
  const title=s(p.title,160);if(title.length<3)return json({error:'Dê um título à tarefa.'},400);
  if(p.meeting_id&&!await db.prepare('SELECT id FROM meetings WHERE id=? AND client_id=?').bind(p.meeting_id,client.id).first())return json({error:'Reunião inválida para este cliente.'},400);
  const id=crypto.randomUUID(),now=Date.now();
  await db.prepare(`INSERT INTO tasks (id,client_id,meeting_id,title,description,strategy,responsible_id,assignee_id,due_date,category,format,channels,stage,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'gestao',?,?,?)`).bind(id,client.id,p.meeting_id||null,title,s(p.description,6000),s(p.strategy,6000),s(p.responsible_id,60)||u.id,s(p.responsible_id,60)||u.id,
    /^\d{4}-\d{2}-\d{2}$/.test(p.due_date||'')?p.due_date:'',CATEGORIES.includes(p.category)?p.category:'social',FORMATS.includes(p.format)?p.format:'feed',CHANNELS.includes(p.channels)?p.channels:'ambos',u.id,now,now).run();
  await logTask(id,u,'criada',{to:'gestao'});
  await logEvent(client.id,'sistema',`Tarefa criada: ${title}`,'',u);
  return json({id});
}

export async function PATCH(req:Request){
  const u=currentUser(req) as U|null;
  if(!canSeeTasks(u)||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  const db=database(),now=Date.now();
  const t=await loadTask(u!,p.id);
  if(!t)return json({error:'Tarefa não encontrada (ou fora da sua carteira).'},404);
  const can=taskCan(u!,t);
  const move=async(to:string,action:string,assignee:string,reason='')=>{
    const r=await db.prepare('UPDATE tasks SET stage=?,assignee_id=?,updated_at=? WHERE id=? AND stage=?').bind(to,assignee,now,t.id,t.stage).run();
    if(!r.meta.changes)throw Error('A tarefa mudou de etapa enquanto você editava. Atualize a página.');
    await logTask(t.id,u,action,{from:t.stage,to,toUser:await personName(assignee),reason});
  };

  try{switch(p.action){
    // Salvar: grava o conteúdo SEM mudar de etapa.
    case 'save':{
      const sets:string[]=[],args:any[]=[];
      if(can.editBase){
        if(typeof p.title==='string'){if(s(p.title,160).length<3)return json({error:'Dê um título à tarefa.'},400);sets.push('title=?');args.push(s(p.title,160));}
        for(const k of ['description','strategy'])if(typeof p[k]==='string'){sets.push(k+'=?');args.push(s(p[k],6000));}
        if(typeof p.responsible_id==='string'){sets.push('responsible_id=?');args.push(s(p.responsible_id,60));}
        if(typeof p.due_date==='string'){sets.push('due_date=?');args.push(/^\d{4}-\d{2}-\d{2}$/.test(p.due_date)?p.due_date:'');}
        if(CATEGORIES.includes(p.category)){sets.push('category=?');args.push(p.category);}
        if(FORMATS.includes(p.format)){sets.push('format=?');args.push(p.format);}
        if(CHANNELS.includes(p.channels)){sets.push('channels=?');args.push(p.channels);}
        if(p.meeting_id!==undefined){sets.push('meeting_id=?');args.push(p.meeting_id||null);}
      }
      if(can.editCopy)for(const k of ['copy_notes','art_text','caption'])if(typeof p[k]==='string'){sets.push(k+'=?');args.push(s(p[k],k==='caption'?2200:6000));}
      if(!sets.length)return json({error:'Você não pode editar esta tarefa nesta etapa.'},403);
      await db.prepare(`UPDATE tasks SET ${sets.join(',')},updated_at=? WHERE id=?`).bind(...args,now,t.id).run();
      return json({ok:true,savedAt:now});
    }
    // Envios: validam o que JÁ está salvo no servidor.
    case 'send':{
      const to=p.to;
      if(to==='copy'){
        if(!can.sendCopy)return denied('Só a Gestão envia para o Copy.');
        const faltam=[!t.title&&'título',!(t.description||t.strategy)&&'descrição ou direcionamento',!t.due_date&&'prazo'].filter(Boolean);
        if(faltam.length)return json({error:'Preencha e salve: '+faltam.join(', ')+'.'},400);
      }else if(to==='design'){
        if(!can.sendDesign)return denied('Só o Copy envia para o Design.');
        const faltam=[!t.art_text&&'texto da arte',!t.caption&&t.format!=='stories'&&'legenda'].filter(Boolean);
        if(faltam.length)return json({error:'Preencha e salve: '+faltam.join(' e ')+'.'},400);
      }else if(to==='revisao'){
        if(!can.sendReview)return denied('Só o Design envia para a Revisão.');
        if(!await db.prepare('SELECT id FROM task_versions WHERE task_id=?').bind(t.id).first())return json({error:'Anexe a arte ou o vídeo antes de enviar para a Revisão.'},400);
      }else return json({error:'Etapa inválida.'},400);
      const assignee=s(p.assignee_id,60)||await defaultAssignee(t.client_id,to);
      await move(to,'enviada',assignee);
      return json({ok:true});
    }
    // Revisão devolve para Copy ou Design, com motivo obrigatório.
    case 'adjust':{
      if(!can.adjust)return denied('Só a Revisão pode pedir ajustes.');
      const reason=s(p.reason,2000);if(reason.length<5)return json({error:'Explique o que precisa ser ajustado.'},400);
      if(!['copy','design'].includes(p.target))return json({error:'Escolha se o ajuste é no Copy ou no Design.'},400);
      await move(p.target,'ajuste',s(p.assignee_id,60)||await defaultAssignee(t.client_id,p.target),reason);
      return json({ok:true});
    }
    // Liberar para o cliente: gera o link de aprovação (só entrega + legenda + mensagem) e, se pedido, envia por email.
    case 'share':{
      if(!can.share)return denied('Só a Revisão libera para o cliente.');
      if(!await db.prepare('SELECT id FROM task_versions WHERE task_id=?').bind(t.id).first())return json({error:'Não há entrega para mostrar ao cliente.'},400);
      const message=s(p.message,2000);
      const token=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
      const url=`${siteOrigin}/aprovacao.html?t=${token}`;
      if(p.via==='email'){
        const to=s(p.to,200).toLowerCase();
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))return json({error:'Informe o email do cliente.'},400);
        if(!mailReady())return json({error:'O envio de emails ainda não está configurado na Vercel.'},503);
        const ok=await sendMail({to,subject:`Para aprovação: ${t.title} | Periférica`,text:`${message||'Olá! Segue o material para sua aprovação.'}\n\nVeja e aprove por aqui: ${url}\n\nPeriférica`});
        if(!ok)return json({error:'O email não saiu. Confira o servidor de email.'},502);
      }
      await db.prepare("UPDATE tasks SET stage='cliente',client_status='aguardando',client_message=?,client_feedback='',share_hash=?,share_expires=?,updated_at=? WHERE id=?")
        .bind(message,await sha256(token),now+30*86400000,now,t.id).run();
      await logTask(t.id,u,'liberada',{from:t.stage,to:'cliente',toUser:t.client_contact||t.client_name,reason:p.via==='email'?'Enviada por email':p.via==='whatsapp'?'Enviada por WhatsApp':'Link gerado'});
      return json({url,phone:t.client_phone||''});
    }
    // Retorno do cliente registrado pela equipe (quando ele responde por fora do link).
    case 'client_result':{
      if(!can.clientResult)return denied();
      if(p.result==='aprovada'){
        await db.prepare("UPDATE tasks SET stage='aprovada',client_status='aprovada',updated_at=? WHERE id=?").bind(now,t.id).run();
        await logTask(t.id,u,'aprovada',{from:'cliente',to:'aprovada',reason:s(p.feedback,2000)});
      }else{
        const fb=s(p.feedback,2000);if(fb.length<3)return json({error:'Escreva o que o cliente pediu.'},400);
        await db.prepare("UPDATE tasks SET stage='revisao',client_status='ajustes',client_feedback=?,updated_at=? WHERE id=?").bind(fb,now,t.id).run();
        await logTask(t.id,u,'cliente_ajustes',{from:'cliente',to:'revisao',reason:fb});
      }
      return json({ok:true});
    }
    case 'comment':{
      const body=s(p.body,3000);if(!body)return json({error:'Escreva o comentário.'},400);
      // @menções: só pessoas que têm acesso a alguma etapa das tarefas
      const people=(await db.prepare('SELECT id,name,access,areas FROM users WHERE active=1').all()).results as any[];
      const mentions=people.filter(pp=>(pp.access==='Administrador'||/"(gestao|copy|design|revisao)"/.test(pp.areas))&&body.toLowerCase().includes('@'+String(pp.name).toLowerCase())).map(pp=>pp.id);
      await db.prepare('INSERT INTO task_comments (id,task_id,author_id,author_name,body,mentions,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),t.id,u!.id,u!.name,body,JSON.stringify(mentions),now).run();
      await db.prepare('UPDATE tasks SET updated_at=? WHERE id=?').bind(now,t.id).run();
      return json({ok:true,mentions:mentions.length});
    }
    case 'ref_add':{
      if(!can.addRefs)return denied('Nesta etapa não dá para adicionar referências.');
      const url=cleanUrl(p.url);if(!url)return json({error:'Use um link https:// ou envie o arquivo.'},400);
      await db.prepare('INSERT INTO task_refs (id,task_id,kind,url,label,created_by,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),t.id,['image','video','link'].includes(p.kind)?p.kind:'link',url,s(p.label,200),u!.name,now).run();
      return json({ok:true});
    }
    case 'ref_del':{
      if(!can.addRefs)return denied();
      await db.prepare('DELETE FROM task_refs WHERE id=? AND task_id=?').bind(p.ref_id,t.id).run();
      return json({ok:true});
    }
    // Nova versão da entrega (as anteriores ficam guardadas).
    case 'version_add':{
      if(!can.addVersion)return denied('Só o Design anexa entregas, na etapa de Design.');
      const url=cleanUrl(p.url);if(!url)return json({error:'Envie a arte/vídeo ou use um link https://.'},400);
      const n:any=await db.prepare('SELECT COALESCE(MAX(version),0)+1 AS n FROM task_versions WHERE task_id=?').bind(t.id).first();
      await db.prepare('INSERT INTO task_versions (id,task_id,version,url,kind,note,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),t.id,n.n,url,p.kind==='video'?'video':'image',s(p.note,500),u!.name,now).run();
      await logTask(t.id,u,'versao',{reason:`Versão ${n.n} anexada`});
      return json({ok:true,version:n.n});
    }
    default:return json({error:'Ação inválida.'},400);
  }}catch(e){return json({error:e instanceof Error?e.message:'Não foi possível salvar.'},409);}
}

export async function DELETE(req:Request){
  const u=currentUser(req) as U|null;
  if(!canSeeTasks(u)||!sameOrigin(req))return denied();
  const p:any=await req.json().catch(()=>({}));
  const t=await loadTask(u!,p.id);
  if(!t)return json({error:'Tarefa não encontrada.'},404);
  if(!taskCan(u!,t).delete)return denied('Só dá para apagar tarefas que ainda estão na Gestão.');
  await database().prepare('DELETE FROM tasks WHERE id=?').bind(t.id).run();
  return json({ok:true});
}
