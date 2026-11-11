import {database} from '../../../db/raw';
import {canAccess,currentUser} from '../../../lib/auth';
import type {U} from '../../../db/tarefas';

// Carteira da Gestão: clientes (com plano contratado, equipe, tarefas e próxima reunião). Respeita a regra de carteira.
export async function GET(req:Request){
  const u=currentUser(req) as U|null;
  if(!u||!canAccess(req,'gestao'))return Response.json({error:'Você não tem acesso à Gestão.'},{status:403});
  const db=database(),hoje=new Date().toISOString().slice(0,10),mes=hoje.slice(0,7);
  const vis=u.admin||!u.squads.length?{sql:'1=1',args:[] as any[]}:{sql:`(c.squad IN (${u.squads.map(()=>'?').join(',')}) OR EXISTS (SELECT 1 FROM client_team ct WHERE ct.client_id=c.id AND ct.user_id=?))`,args:[...u.squads,u.id]};
  const clients=(await db.prepare(`SELECT c.id,c.name,c.segment,c.squad,c.status,c.phase,c.services,
      (SELECT t.user_id FROM client_team t WHERE t.client_id=c.id AND t.role='consultora') AS consultora_id,
      (SELECT u.name FROM client_team t JOIN users u ON u.id=t.user_id WHERE t.client_id=c.id AND t.role='consultora') AS consultora,
      (SELECT k.model FROM contracts k WHERE k.client_id=c.id AND k.status='assin' ORDER BY k.signed_at DESC LIMIT 1) AS plano,
      (SELECT k.value FROM contracts k WHERE k.client_id=c.id AND k.status='assin' ORDER BY k.signed_at DESC LIMIT 1) AS plano_valor,
      (SELECT COUNT(*) FROM tasks x WHERE x.client_id=c.id AND x.stage NOT IN ('aprovada')) AS abertas,
      (SELECT COUNT(*) FROM tasks x WHERE x.client_id=c.id AND x.stage NOT IN ('aprovada') AND x.due_date<>'' AND x.due_date<?) AS atrasadas,
      (SELECT COUNT(*) FROM tasks x WHERE x.client_id=c.id AND x.stage='aprovada' AND substr(datetime(x.updated_at/1000,'unixepoch'),1,7)=?) AS aprovadas_mes,
      (SELECT COUNT(*) FROM tasks x WHERE x.client_id=c.id AND substr(x.due_date,1,7)=?) AS do_mes,
      (SELECT m.date||' '||m.start_time||'|'||m.title FROM meetings m WHERE m.client_id=c.id AND m.date>=? ORDER BY m.date,m.start_time LIMIT 1) AS proxima
    FROM clients c WHERE c.phase IN ('gestao','onboarding') AND ${vis.sql} ORDER BY c.name`).bind(hoje,mes,mes,hoje,...vis.args).all()).results;
  return Response.json({clients},{headers:{'Cache-Control':'no-store'}});
}
