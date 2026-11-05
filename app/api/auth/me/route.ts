import {currentUser} from '../../../../lib/auth';
export async function GET(req:Request){const u=currentUser(req);return u?Response.json(u,{headers:{'Cache-Control':'no-store'}}):Response.json({error:'Sem sessão.'},{status:401});}
