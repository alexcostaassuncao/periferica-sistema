import {database} from '../../../db/raw';
import {canAccess,currentUser,sameOrigin} from '../../../lib/auth';
import {ONBOARDING_STEPS,STEPS_REQUIRED_FOR_GESTAO,TEAM_ROLES,addBusinessDays,logEvent,onboardingProgress} from '../../../db/clientes';

// Onboarding real: um por cliente, checklist salvo no banco, progresso = itens feitos / total.
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const denied=()=>json({error:'Você não tem acesso ao Onboarding.'},403);

function readyForGestao(items:any[]){
  return STEPS_REQUIRED_FOR_GESTAO.every(st=>{const it=items.filter(i=>i.step===st);return it.length>0&&it.every(i=>i.done);});
}

export async function GET(req:Request){
  if(!canAccess(req,'onboarding')&&!canAccess(req,'clientes'))return denied();
  const q=new URL(req.url).searchParams,db=database();
  const id=q.get('id');
  if(id){
    const ob:any=await db.prepare('SELECT o.*,c.name AS client_name,c.segment,c.squad,c.services FROM onboardings o JOIN clients c ON c.id=o.client_id WHERE o.id=?').bind(id).first();
    if(!ob)return json({error:'Onboarding não encontrado.'},404);
    const items=(await db.prepare('SELECT * FROM onboarding_items WHERE onboarding_id=? ORDER BY step,position').bind(id).all()).results as any[];
    const team=(await db.prepare('SELECT t.role,t.user_id,u.name FROM client_team t LEFT JOIN users u ON u.id=t.user_id WHERE t.client_id=?').bind(ob.client_id).all()).results as any[];
    const prog=(await onboardingProgress([id]))[id]||{done:0,total:0,pct:0};
    return json({onboarding:{...ob,progress:prog},
      steps:ONBOARDING_STEPS.map((s,i)=>{const it=items.filter(x=>x.step===i).map(x=>({...x,done:!!x.done}));
        const resp=team.find(t=>t.role===s.role);
        return {...s,index:i,items:it,done:it.length>0&&it.every(x=>x.done),started:it.some(x=>x.done),responsible:resp?.name||(resp?.user_id==='admin'?'Administrador':''),roleLabel:TEAM_ROLES.find(r=>r[0]===s.role)?.[1]};}),
      readyForGestao:readyForGestao(items.map(x=>({...x,done:!!x.done}))),
      requiredSteps:STEPS_REQUIRED_FOR_GESTAO.map(i=>ONBOARDING_STEPS[i].title)});
  }
  // Lista: onboardings + clientes ativos que ainda não começaram
  const obs=(await db.prepare(`SELECT o.*,c.name AS client_name,c.segment,c.squad,c.services,
      (SELECT u.name FROM client_team t LEFT JOIN users u ON u.id=t.user_id WHERE t.client_id=c.id AND t.role='consultora') AS consultora
    FROM onboardings o JOIN clients c ON c.id=o.client_id ORDER BY o.status, o.started_at DESC`).all()).results as any[];
  const prog=await onboardingProgress(obs.map(o=>o.id));
  const waiting=(await db.prepare("SELECT id,name,segment,squad,services,created_at FROM clients WHERE status='ativo' AND phase='' AND id NOT IN (SELECT client_id FROM onboardings) ORDER BY created_at DESC").all()).results;
  return json({onboardings:obs.map(o=>({...o,progress:prog[o.id]||{done:0,total:0,pct:0}})),waiting});
}

// Iniciar onboarding de um cliente (se já existir, devolve o existente — nunca duplica).
export async function POST(req:Request){
  if((!canAccess(req,'onboarding')&&!canAccess(req,'clientes'))||!sameOrigin(req))return denied();
  const u=currentUser(req)!;
  const p:any=await req.json().catch(()=>({}));
  const db=database();
  const client:any=await db.prepare('SELECT id,name,status,phase FROM clients WHERE id=?').bind(p.client_id).first();
  if(!client)return json({error:'Cliente não encontrado.'},404);
  const existing:any=await db.prepare('SELECT id FROM onboardings WHERE client_id=?').bind(client.id).first();
  if(existing)return json({id:existing.id,existing:true});
  if(client.status!=='ativo')return json({error:'Só clientes ativos podem iniciar o onboarding.'},409);
  const id=crypto.randomUUID(),now=Date.now();
  const ops=[db.prepare("INSERT INTO onboardings (id,client_id,status,started_at,started_by,due_at) VALUES (?,?,'andamento',?,?,?) ON CONFLICT(client_id) DO NOTHING").bind(id,client.id,now,u.name,addBusinessDays(now,10))];
  ONBOARDING_STEPS.forEach((s,step)=>s.items.forEach((label,position)=>ops.push(
    db.prepare('INSERT INTO onboarding_items (id,onboarding_id,step,position,label,role) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),id,step,position,label,s.role))));
  ops.push(db.prepare("UPDATE clients SET phase='onboarding' WHERE id=?").bind(client.id));
  await db.batch(ops);
  // Se outra pessoa iniciou ao mesmo tempo, fica valendo o primeiro.
  const final:any=await db.prepare('SELECT id FROM onboardings WHERE client_id=?').bind(client.id).first();
  if(final.id!==id)await db.prepare('DELETE FROM onboarding_items WHERE onboarding_id=?').bind(id).run();
  else await logEvent(client.id,'sistema','Onboarding iniciado','Prazo: 10 dias úteis.',u);
  return json({id:final.id});
}

// Marcar item (item_id, done, notes) · enviar para Gestão (id, action:'send_gestao')
export async function PATCH(req:Request){
  if(!canAccess(req,'onboarding')||!sameOrigin(req))return denied();
  const u=currentUser(req)!;
  const p:any=await req.json().catch(()=>({}));
  const db=database(),now=Date.now();
  if(p.item_id){
    const item:any=await db.prepare('SELECT i.*,o.status AS ob_status,o.client_id FROM onboarding_items i JOIN onboardings o ON o.id=i.onboarding_id WHERE i.id=?').bind(p.item_id).first();
    if(!item)return json({error:'Item não encontrado.'},404);
    if(item.ob_status==='concluido')return json({error:'Este onboarding já foi enviado para Gestão.'},409);
    const sets:string[]=[],args:any[]=[];
    if(typeof p.done==='boolean'){sets.push('done=?','done_by=?','done_at=?');args.push(p.done?1:0,p.done?u.name:'',p.done?now:null);}
    if(typeof p.notes==='string'){sets.push('notes=?');args.push(p.notes.slice(0,2000));}
    if(!sets.length)return json({error:'Nada para salvar.'},400);
    await db.prepare(`UPDATE onboarding_items SET ${sets.join(',')} WHERE id=?`).bind(...args,item.id).run();
    const prog=(await onboardingProgress([item.onboarding_id]))[item.onboarding_id];
    return json({ok:true,progress:prog});
  }
  if(p.action==='send_gestao'){
    const ob:any=await db.prepare('SELECT * FROM onboardings WHERE id=?').bind(p.id).first();
    if(!ob)return json({error:'Onboarding não encontrado.'},404);
    if(ob.status==='concluido')return json({ok:true});
    const items=((await db.prepare('SELECT step,done FROM onboarding_items WHERE onboarding_id=?').bind(ob.id).all()).results as any[]).map(x=>({...x,done:!!x.done}));
    if(!readyForGestao(items))return json({error:'Para enviar à Gestão, conclua as etapas "Apresentação estratégica" e "Ativação" (apresentação e alinhamentos).'},409);
    await db.batch([
      db.prepare("UPDATE onboardings SET status='concluido',finished_at=? WHERE id=?").bind(now,ob.id),
      db.prepare("UPDATE clients SET phase='gestao' WHERE id=?").bind(ob.client_id),
    ]);
    await logEvent(ob.client_id,'sistema','Onboarding concluído — cliente enviado para Gestão','',u);
    return json({ok:true});
  }
  return json({error:'Ação inválida.'},400);
}
