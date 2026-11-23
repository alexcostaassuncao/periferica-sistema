export type ProductInterest={category:'gestao'|'projeto'|'outro';name:string};

// This catalog is shared by the CRM, public intake form, and channel integrations.
export const PRODUCT_CATALOG:{gestao:string[];projeto:string[];outro:string[]}={
  gestao:['Gestão de Marketing','Tráfego Pago'],
  projeto:['Criação de Sites','Loja Virtual / E-commerce','Branding / Identidade Visual'],
  outro:['Automação com IA','Outros serviços'],
};

const ALL_PRODUCTS=Object.entries(PRODUCT_CATALOG).flatMap(([category,names])=>
  names.map(name=>({category:category as ProductInterest['category'],name})));
const normalize=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

const RULES:[RegExp,ProductInterest][]=[
  [/e-?commerce|loja\s*(virtual|online)|loja\b/,{category:'projeto',name:'Loja Virtual / E-commerce'}],
  [/site|website|landing|pagina\s+(de\s+)?captura/,{category:'projeto',name:'Criação de Sites'}],
  [/brand|identidade|logo|logotipo/,{category:'projeto',name:'Branding / Identidade Visual'}],
  [/automat|inteligencia artificial|(?:^|\s)ia(?:\s|$)/,{category:'outro',name:'Automação com IA'}],
  [/trafego|ads|anuncios|midia paga|paid traffic/,{category:'gestao',name:'Tráfego Pago'}],
  [/gestao|marketing|social media|redes sociais|conteudo|smart business/,{category:'gestao',name:'Gestão de Marketing'}],
  [/\b(outro|outros|other)\b/,{category:'outro',name:'Outros serviços'}],
];

export function resolveProductInterests(input:unknown):ProductInterest[]{
  const values=Array.isArray(input)?input:input===null||input===undefined||input===''?[]:[input];
  const result=new Map<string,ProductInterest>();
  const add=(product:ProductInterest)=>result.set(product.name,product);
  for(const value of values){
    const raw=typeof value==='string'?value:
      value&&typeof value==='object'&&'name' in value?String((value as {name:unknown}).name||''):'';
    const text=normalize(raw);
    if(!text)continue;
    const exact=ALL_PRODUCTS.find(product=>normalize(product.name)===text);
    if(exact){add(exact);continue;}
    let matched=false;
    for(const [pattern,product] of RULES)if(pattern.test(text)){add(product);matched=true;}
    if(!matched)add({category:'outro',name:'Outros serviços'});
  }
  return [...result.values()];
}

export function normalizeProductInterest(name:string,category?:string):ProductInterest|null{
  const exact=ALL_PRODUCTS.find(product=>normalize(product.name)===normalize(name));
  if(exact)return exact;
  const matches=resolveProductInterests(name);
  if(!matches.length)return null;
  return matches.find(product=>product.category===category)||matches.find(product=>product.name==='Tráfego Pago')||matches[0];
}

export function matchInterest(text:string):ProductInterest|null{
  return resolveProductInterests(text)[0]||null;
}
