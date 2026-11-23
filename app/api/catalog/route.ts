import {currentUser} from '../../../lib/auth';
import {PRODUCT_CATALOG} from '../../../db/produtos';
import {PLANOS} from '../../../lib/contratos/modelos';

// Catálogo de produtos e serviços (Cadastros → Produtos e serviços). Os planos de Gestão trazem a tabela de preços dos contratos.
export async function GET(req:Request){
  if(!currentUser(req))return Response.json({error:'Sem sessão.'},{status:401});
  const plans=Object.entries(PLANOS).map(([name,p])=>({name,trafego:p.trafego,social:p.social,investMin:p.investMin,
    precos:Object.entries(p.precos).map(([modalidade,[implantacao,mensal]])=>({modalidade,implantacao,mensal}))}));
  return Response.json({catalog:PRODUCT_CATALOG,plans},{headers:{'Cache-Control':'no-store'}});
}
