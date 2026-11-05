import {canAccess} from '../../../../lib/auth';
import {MODALIDADES,PLANOS,modeloDoContrato,sugestoes} from '../../../../lib/contratos/modelos';

// Valores sugeridos para o formulário do contrato: ?kind=Gestão&model=ADS PRO&modalidade=Anual
export async function GET(req:Request){
  if(!canAccess(req,'contratos')&&!canAccess(req,'comercial'))return Response.json({error:'Sem acesso.'},{status:403});
  const q=new URL(req.url).searchParams;
  const kind=q.get('kind')||'Gestão',model=q.get('model')||'ADS PRO',modalidade=q.get('modalidade')||'Semestral';
  const modelo=modeloDoContrato(kind,model);
  return Response.json({
    modelo,
    sugestao:modelo?sugestoes(modelo,model,modalidade):{},
    modalidades:Object.keys(MODALIDADES),
    planos:Object.fromEntries(Object.entries(PLANOS).map(([k,p])=>[k,{precos:p.precos,trafego:p.trafego,social:p.social}])),
  },{headers:{'Cache-Control':'no-store'}});
}
