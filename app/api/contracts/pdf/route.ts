import {database} from '../../../../db/raw';
import {canAccess} from '../../../../lib/auth';
import {gerarPdf,nomeArquivo} from '../../../../lib/contratos/gerar';

// PDF do contrato para a equipe: ?id=...  (&download=1 baixa o arquivo; sem ele, abre no navegador)
export async function GET(req:Request){
  if(!canAccess(req,'contratos')&&!canAccess(req,'comercial'))return Response.json({error:'Sem acesso.'},{status:403});
  const q=new URL(req.url).searchParams;
  const c:any=await database().prepare('SELECT * FROM contracts WHERE id=?').bind(q.get('id')).first();
  if(!c)return Response.json({error:'Contrato não encontrado.'},{status:404});
  try{
    const pdf=await gerarPdf(c);
    return new Response(Buffer.from(pdf),{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store',
      'Content-Disposition':`${q.get('download')?'attachment':'inline'}; filename="${nomeArquivo(c)}"`}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'Não foi possível gerar o PDF.'},{status:400});}
}
