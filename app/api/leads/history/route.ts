import {database} from '../../../../db/raw';
import {canAccess} from '../../../../lib/auth';

export async function GET(req:Request){
  if(!canAccess(req,'comercial'))return Response.json({error:'Você não tem acesso ao Comercial.'},{status:403});
  const leadId=new URL(req.url).searchParams.get('lead_id');
  if(!leadId)return Response.json({error:'Lead inválido.'},{status:400});
  const db=database();
  const history=(await db.prepare(`SELECT id,changed_by_name,old_data,new_data,created_at
    FROM lead_attribution_history WHERE lead_id=? ORDER BY created_at DESC LIMIT 100`).bind(leadId).all()).results;
  const stages=(await db.prepare(`SELECT id,from_stage,to_stage,changed_by_name,changed_at
    FROM lead_stage_history WHERE lead_id=? ORDER BY changed_at DESC LIMIT 100`).bind(leadId).all()).results;
  return Response.json({history,stages},{headers:{'Cache-Control':'no-store'}});
}
