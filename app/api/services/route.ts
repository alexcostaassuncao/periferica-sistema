import {database} from '../../../db/raw';
import {canAccess,currentUser,sameOrigin} from '../../../lib/auth';
import {TEAM_ROLES,logEvent} from '../../../db/clientes';

/* Serviços contratados (cada contrato assinado vira um serviço na esteira da área: Gestão ou Projetos).
   GET ?line=gestao|projetos        fila da área (aguardando, em andamento, concluídos)
   PATCH {id,action:'assume',manager_id,team:{consultora,copy,design,trafego}}   o gerente assume, define os responsáveis e inicia
   PATCH {id,action:'finish'|'reopen'} */
const json=(d:any,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
const LINES=['gestao','projetos'];
const canLine=(req:Request,line:string)=>canAccess(req,'onboarding')||canAccess(req,line==='projetos'?'projetos':'gestao');

export async function GET(req:Request){
  const q=new URL(req.url).searchParams,line=q.get('line')||'';
  if(line&&!LINES.includes(line))return json({error:'Área inválida.'},400);
  if(!(line?canLine(req,line):LINES.some(l=>canLine(req,l))))return json({error:'Sem acesso.'},403);
  const services=(await database().prepare(`SELECT s.*,c.name AS client_name,c.segment,c.squad,c.phase,k.value AS contract_value,k.signed_at,
      u.name AS manager_name,(SELECT o.id FROM onboardings o WHERE o.client_id=s.client_id) AS onboarding_id
    FROM client_services s JOIN clients c ON c.id=s.client_id LEFT JOIN contracts k ON k.id=s.contract_id LEFT JOIN users u ON u.id=s.manager_id
    ${line?'WHERE s.line=?':''} ORDER BY CASE s.status WHEN 'aguardando' THEN 0 WHEN 'andamento' THEN 1 ELSE 2 END,s.created_at DESC LIMIT 300`).bind(...(line?[line]:[])).all()).results as any[];
  return json({services:services.map(s=>({...s,responsibles:JSON.parse(s.responsibles||'[]')}))});
}

export async function PATCH(req:Request){
  const u=currentUser(req);
  const p:any=await req.json().catch(()=>({}));
  const db=database(),now=Date.now();
  const sv:any=await db.prepare('SELECT s.*,c.name AS client_name FROM client_services s JOIN clients c ON c.id=s.client_id WHERE s.id=?').bind(String(p.id||'')).first();
  if(!sv)return json({error:'Serviço não encontrado.'},404);
  if(!u||!canLine(req,sv.line)||!sameOrigin(req))return json({error:'Sem acesso a esta área.'},403);
  if(p.action==='assume'){
    if(sv.status!=='aguardando')return json({error:'Este serviço já foi assumido.'},409);
    const manager=String(p.manager_id||u.id).slice(0,60);
    if(manager!=='admin'&&!await db.prepare('SELECT id FROM users WHERE id=?').bind(manager).first())return json({error:'Gerente inválido.'},400);
    const team:[string,string][]=TEAM_ROLES.map(([r])=>[r,String(p.team?.[r]||'').slice(0,60)] as [string,string]).filter(([,id])=>id);
    const ops=[db.prepare("UPDATE client_services SET status='andamento',manager_id=?,responsibles=?,notes=?,started_at=?,started_by=?,updated_at=? WHERE id=? AND status='aguardando'")
      .bind(manager,JSON.stringify(team.map(([role,user_id])=>({role,user_id}))),String(p.notes||'').slice(0,2000),now,u.name,now,sv.id)];
    // Os responsáveis definidos aqui viram a equipe do cliente (mesma equipe da ficha e da Gestão).
    for(const [role,user_id] of team)ops.push(db.prepare('INSERT INTO client_team (client_id,role,user_id) VALUES (?,?,?) ON CONFLICT(client_id,role) DO UPDATE SET user_id=excluded.user_id').bind(sv.client_id,role,user_id));
    await db.batch(ops);
    await logEvent(sv.client_id,'sistema',`Serviço assumido: ${sv.name}`,`Área: ${sv.line==='projetos'?'Projetos':'Gestão'}. Responsáveis definidos.`,u);
    return json({ok:true,line:sv.line,client_id:sv.client_id});
  }
  if(p.action==='finish'||p.action==='reopen'){
    const to=p.action==='finish'?'concluido':'andamento';
    await db.prepare('UPDATE client_services SET status=?,finished_at=?,updated_at=? WHERE id=?').bind(to,to==='concluido'?now:null,now,sv.id).run();
    await logEvent(sv.client_id,'sistema',`Serviço ${to==='concluido'?'concluído':'reaberto'}: ${sv.name}`,'',u);
    return json({ok:true});
  }
  return json({error:'Ação inválida.'},400);
}
