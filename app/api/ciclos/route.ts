import {database} from '../../../db/raw';
import {currentUser,sameOrigin} from '../../../lib/auth';
import {sha256} from '../../../lib/session';
import {siteOrigin} from '../../../db/social';
import {logEvent} from '../../../db/clientes';
import {STAGE_ROLE,type U} from '../../../db/tarefas';
import {isMonth,meetingWindow,monthLabel,openCycle,planPreview,syncCycles} from '../../../db/ciclos';

/* Ciclo mensal de um cliente (Gestão → aba "Ciclo do mês").
   GET ?client=ID&month=YYYY-MM   ciclo, entregas (grade), reuniões da janela de planejamento e prévia do plano
   POST {client_id,month}         abre o ciclo e gera as entregas do plano (não duplica)
   PATCH {client_id,month,action}
     plan     {strategy,meeting_id}                          estratégia do mês e reunião de planejamento
     items    {items:[{id,title,objective,strategy,publish_date,due_date,script,needs_capture,capture_id,editor_id}]}  direcionamento de cada entrega
     conclude                                               conclui o planejamento: as entregas vão para a fila do Copy
     grade                                                  gera o link da grade do mês para o cliente aprovar
     dates    {service_start,service_end}                   vigência da operação do cliente */
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const gestor=(u:U|null)=>!!u&&(u.admin||u.areas.includes('gestao'));
const s=(v:any,max:number)=>String(v??'').trim().slice(0,max);
const isDate=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);

async function clientFor(u:U,id:string){
  const vis=u.admin||!u.squads.length?{sql:'1=1',args:[] as any[]}:{sql:`(COALESCE(c.squad,'')='' OR c.squad IN (${u.squads.map(()=>'?').join(',')}) OR EXISTS (SELECT 1 FROM client_team ct WHERE ct.client_id=c.id AND ct.user_id=?))`,args:[...u.squads,u.id]};
  return database().prepare(`SELECT c.* FROM clients c WHERE c.id=? AND ${vis.sql}`).bind(id,...vis.args).first<any>();
}

export async function GET(req:Request){
  const u=currentUser(req) as U|null;if(!gestor(u))return json({error:'Sem acesso à Gestão.'},403);
  const q=new URL(req.url).searchParams,month=q.get('month')||'';
  if(!isMonth(month))return json({error:'Mês inválido.'},400);
  const c=await clientFor(u!,q.get('client')||'');if(!c)return json({error:'Cliente não encontrado (ou fora da sua carteira).'},404);
  const db=database();
  await syncCycles(month,c.id);
  const cycle:any=await db.prepare('SELECT id,client_id,month,status,strategy,meeting_id,opened_at,opened_by,planning_done_at,planning_done_by,closed_at,grade_expires FROM client_cycles WHERE client_id=? AND month=?').bind(c.id,month).first();
  const tasks=(await db.prepare(`SELECT t.id,t.title,t.description,t.strategy,t.objective,t.script,t.needs_capture,t.capture_id,t.editor_id,t.stage,t.client_status,t.category,t.format,
      t.due_date,t.publish_date,t.required,t.assignee_id,t.responsible_id,t.art_text,t.caption,t.done_at,
      (SELECT url FROM task_versions v WHERE v.task_id=t.id ORDER BY version DESC LIMIT 1) AS last_url,
      (SELECT kind FROM task_versions v WHERE v.task_id=t.id ORDER BY version DESC LIMIT 1) AS last_kind,
      EXISTS (SELECT 1 FROM publications p JOIN publication_targets pt ON pt.publication_id=p.id WHERE p.task_id=t.id AND pt.status='published') AS publicada
    FROM tasks t WHERE t.client_id=? AND COALESCE(NULLIF(t.plan_month,''),substr(t.due_date,1,7))=? ORDER BY t.required DESC,t.category,t.publish_date,t.due_date,t.created_at`).bind(c.id,month).all()).results;
  const w=meetingWindow(month);
  const meetings=(await db.prepare(`SELECT id,title,date,start_time,minutes_summary,(minutes_text<>'') AS has_minutes FROM meetings
    WHERE client_id=? AND (date BETWEEN ? AND ? OR id=?) ORDER BY date,start_time`).bind(c.id,w.from,w.to,cycle?.meeting_id||'').all()).results;
  return json({client:{id:c.id,name:c.name,squad:c.squad,service_start:c.service_start,service_end:c.service_end},month,label:monthLabel(month),window:w,
    cycle,tasks,meetings,preview:await planPreview(c.id,month)});
}

export async function POST(req:Request){
  const u=currentUser(req) as U|null;if(!gestor(u)||!sameOrigin(req))return json({error:'Só a Gestão abre ciclos.'},403);
  const p:any=await req.json().catch(()=>({}));
  if(!isMonth(p.month))return json({error:'Mês inválido.'},400);
  const c=await clientFor(u!,s(p.client_id,60));if(!c)return json({error:'Cliente não encontrado.'},404);
  const r=await openCycle(c.id,p.month,u);
  return json({...r,message:r.noPlan?'Ciclo aberto, mas o plano do cliente ainda não tem entregas definidas.':r.created?`${r.created} entregas criadas pelo plano.`:'O ciclo já estava aberto com todas as entregas.'});
}

export async function PATCH(req:Request){
  const u=currentUser(req) as U|null;if(!gestor(u)||!sameOrigin(req))return json({error:'Só a Gestão altera o ciclo.'},403);
  const p:any=await req.json().catch(()=>({}));
  const c=await clientFor(u!,s(p.client_id,60));if(!c)return json({error:'Cliente não encontrado.'},404);
  const db=database(),now=Date.now();
  if(p.action==='dates'){
    const st=p.service_start===''||isDate(p.service_start)?p.service_start:null,en=p.service_end===''||isDate(p.service_end)?p.service_end:null;
    if(st===null||en===null)return json({error:'Datas inválidas.'},400);
    if(st&&en&&en<st)return json({error:'O fim da operação não pode ser antes do início.'},400);
    await db.prepare('UPDATE clients SET service_start=?,service_end=? WHERE id=?').bind(st,en,c.id).run();
    await logEvent(c.id,'sistema','Vigência da operação atualizada',`Início: ${st||'—'} · Fim: ${en||'—'}`,u);
    return json({ok:true});
  }
  if(!isMonth(p.month))return json({error:'Mês inválido.'},400);
  const cycle:any=await db.prepare('SELECT * FROM client_cycles WHERE client_id=? AND month=?').bind(c.id,p.month).first();
  if(!cycle)return json({error:'Abra o ciclo deste mês primeiro.'},404);
  const inMonth=async(id:string)=>db.prepare("SELECT * FROM tasks WHERE id=? AND client_id=? AND COALESCE(NULLIF(plan_month,''),substr(due_date,1,7))=?").bind(id,c.id,p.month).first<any>();

  if(p.action==='plan'){
    const sets:string[]=[],args:any[]=[];
    if(typeof p.strategy==='string'){sets.push('strategy=?');args.push(s(p.strategy,8000));}
    if(p.meeting_id!==undefined){
      if(p.meeting_id&&!await db.prepare('SELECT id FROM meetings WHERE id=? AND client_id=?').bind(p.meeting_id,c.id).first())return json({error:'Reunião inválida.'},400);
      sets.push('meeting_id=?');args.push(p.meeting_id||null);
    }
    if(!sets.length)return json({error:'Nada para salvar.'},400);
    await db.prepare(`UPDATE client_cycles SET ${sets.join(',')} WHERE id=?`).bind(...args,cycle.id).run();
    return json({ok:true});
  }
  if(p.action==='items'){
    const items=Array.isArray(p.items)?p.items.slice(0,200):[];
    const ops:any[]=[];
    for(const it of items){
      const t=await inMonth(s(it.id,60));if(!t)return json({error:'Entrega não encontrada neste ciclo.'},404);
      if(t.stage==='aprovada')continue;
      const sets:string[]=[],args:any[]=[];
      if(typeof it.title==='string'){const v=s(it.title,160);if(v.length<3)return json({error:'Toda entrega precisa de um tema com pelo menos 3 letras.'},400);sets.push('title=?');args.push(v);}
      for(const [k,max] of [['objective',2000],['strategy',6000],['script',8000]] as const)if(typeof it[k]==='string'){sets.push(k+'=?');args.push(s(it[k],max));}
      for(const k of ['publish_date','due_date'])if(it[k]!==undefined){if(it[k]!==''&&!isDate(it[k]))return json({error:'Data inválida.'},400);sets.push(k+'=?');args.push(it[k]);}
      if(it.needs_capture!==undefined){sets.push('needs_capture=?');args.push(it.needs_capture?1:0);}
      for(const k of ['capture_id','editor_id'])if(typeof it[k]==='string'){sets.push(k+'=?');args.push(s(it[k],60));}
      if(sets.length)ops.push(db.prepare(`UPDATE tasks SET ${sets.join(',')},updated_at=? WHERE id=?`).bind(...args,now,t.id));
    }
    if(ops.length)for(let i=0;i<ops.length;i+=50)await db.batch(ops.slice(i,i+50));
    return json({ok:true,saved:ops.length});
  }
  if(p.action==='conclude'){
    if(cycle.planning_done_at)return json({error:'O planejamento deste mês já foi concluído.'},409);
    const list=(await db.prepare("SELECT * FROM tasks WHERE client_id=? AND plan_month=? AND stage='gestao'").bind(c.id,p.month).all()).results as any[];
    const falta=list.filter(t=>!t.objective&&!t.strategy);
    if(falta.length)return json({error:`Defina o objetivo ou o direcionamento de todas as entregas (${falta.length} sem direcionamento).`,missing:falta.map(t=>t.id)},400);
    const copy:any=await db.prepare("SELECT user_id FROM client_team WHERE client_id=? AND role=?").bind(c.id,STAGE_ROLE.copy).first();
    const ops:any[]=[db.prepare("UPDATE client_cycles SET status=CASE WHEN status='concluido' THEN status ELSE 'producao' END,planning_done_at=?,planning_done_by=? WHERE id=?").bind(now,u!.name,cycle.id)];
    for(const t of list){
      // A ata e a estratégia do mês acompanham a entrega: o Copy não precisa receber nada por fora.
      const strategy=[t.strategy,cycle.strategy&&!t.strategy?`Estratégia do mês: ${cycle.strategy}`:''].filter(Boolean).join('\n\n');
      ops.push(db.prepare("UPDATE tasks SET stage='copy',assignee_id=?,strategy=?,meeting_id=COALESCE(meeting_id,?),updated_at=? WHERE id=? AND stage='gestao'")
        .bind(copy?.user_id||'',strategy.slice(0,6000),cycle.meeting_id||null,now,t.id));
      ops.push(db.prepare("INSERT INTO task_history (id,task_id,action,from_stage,to_stage,to_user,reason,by_id,by_name,created_at) VALUES (?,?,'enviada','gestao','copy','',?,?,?,?)")
        .bind(crypto.randomUUID(),t.id,'Planejamento do mês concluído',u!.id,u!.name,now));
    }
    for(let i=0;i<ops.length;i+=50)await db.batch(ops.slice(i,i+50));
    await logEvent(c.id,'sistema',`Planejamento de ${monthLabel(p.month)} concluído`,`${list.length} entregas enviadas para o Copy.`,u);
    return json({ok:true,sent:list.length});
  }
  if(p.action==='grade'){
    const token=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
    await db.prepare('UPDATE client_cycles SET grade_hash=?,grade_expires=? WHERE id=?').bind(await sha256(token),now+45*86400000,cycle.id).run();
    await logEvent(c.id,'sistema',`Link da grade de ${monthLabel(p.month)} gerado`,'Vale 45 dias. Gerar de novo invalida o anterior.',u);
    return json({url:`${siteOrigin}/grade.html?t=${token}`,phone:c.phone||''});
  }
  return json({error:'Ação inválida.'},400);
}
