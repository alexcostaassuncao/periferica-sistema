import {PLANOS} from '../lib/contratos/modelos';

/* Catálogo de produtos/serviços do Comercial. Os planos de Gestão são os mesmos dos contratos (ADS PRO, SOCIAL MEDIA...),
   então o que é escolhido no lead já casa com o modelo do contrato. Valores NÃO ficam aqui: são definidos na proposta. */
export const PRODUCT_CATALOG:{gestao:string[];projeto:string[];outro:string[]}={
  gestao:Object.keys(PLANOS),
  projeto:['Website institucional','Landing page','E-commerce','Blog','Web banner','Banner impresso','Identidade visual','Material gráfico'],
  outro:[],
};

// Reconhece o produto a partir do texto que o lead escreveu ("quero um site", "ads pro", "loja virtual"...).
const RULES:[RegExp,'gestao'|'projeto',string][]=[
  [/ads\s*pro.*(social|redes)|(trafego|ads|gestao).*(social|redes)|(social|redes).*(trafego|ads)/,'gestao','ADS PRO + SOCIAL MEDIA'],
  [/ads\s*pro/,'gestao','ADS PRO'],
  [/smart/,'gestao','SMART BUSINESS'],
  [/trafego\s*light/,'gestao','TRÁFEGO LIGHT'],
  [/landing|lp\b|pagina de captura/,'projeto','Landing page'],
  [/e-?commerce|loja\s*(virtual|online)|tray/,'projeto','E-commerce'],
  [/blog/,'projeto','Blog'],
  [/web\s*banner/,'projeto','Web banner'],
  [/banner/,'projeto','Banner impresso'],
  [/identidade|logo|logotipo|marca/,'projeto','Identidade visual'],
  [/folder|panfleto|cartao|material grafico|flyer/,'projeto','Material gráfico'],
  [/site|website/,'projeto','Website institucional'],
  [/social|redes sociais|instagram|conteudo/,'gestao','SOCIAL MEDIA'],
  [/trafego|anuncio|ads|meta|google|gestao|marketing/,'gestao','ADS PRO'],
];
export function matchInterest(text:string):{category:'gestao'|'projeto'|'outro';name:string}|null{
  const t=String(text||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
  if(!t||t==='outro')return null;
  const hit=RULES.find(([re])=>re.test(t));
  return hit?{category:hit[1],name:hit[2]}:{category:'outro',name:String(text).trim().slice(0,120)};
}
