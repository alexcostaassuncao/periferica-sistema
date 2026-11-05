// Áreas do sistema e perfis prontos. Cada usuário enxerga só as áreas marcadas no cadastro.
// O administrador enxerga tudo.

export const AREAS=[
  ['comercial','Comercial'],['contratos','Contratos'],['clientes','Clientes'],
  ['onboarding','Onboarding'],['gestao','Gestão'],['revisao','Revisão'],['copy','Copy'],['design','Design'],
  ['publicacoes','Publicações'],['trafego','Tráfego'],['projetos','Projetos'],
  ['financeiro','Financeiro · Direção'],['equipe','Equipe (usuários)'],['agenda','Agenda'],['configuracoes','Configurações'],
] as const;
export type Area=typeof AREAS[number][0];
export const AREA_KEYS=AREAS.map(a=>a[0]) as string[];

export const PROFILES:Record<string,string[]>={
  'Administrador':AREA_KEYS,
  // Desenvolvedor: vê todas as telas e cuida das sugestões do modo desenvolvedor.
  'Desenvolvedor':AREA_KEYS,
  'Comercial':['comercial','contratos','clientes','agenda'],
  'Consultora':['clientes','onboarding','gestao','revisao','publicacoes','agenda'],
  'Copy':['copy','agenda'],
  'Design':['design','agenda'],
  'Tráfego':['trafego','publicacoes','agenda'],
  'Projetos':['projetos','onboarding','clientes','agenda'],
  'Financeiro':['financeiro','contratos','clientes','agenda'],
};

// Páginas que qualquer usuário logado pode abrir.
const OPEN_PAGES=new Set(['/','/inicio.html','/variavel.html']);
// Qual área libera cada página.
const PAGE_AREA:Record<string,string>={
  '/comercial.html':'comercial','/contratos.html':'contratos','/clientes.html':'clientes','/onboarding.html':'onboarding',
  '/gestao.html':'gestao','/revisao.html':'revisao','/copy.html':'copy','/design.html':'design','/publicacoes.html':'publicacoes',
  '/trafego.html':'trafego','/projetos.html':'projetos','/financeiro.html':'financeiro','/equipe.html':'equipe',
  '/agenda.html':'agenda','/configuracoes.html':'configuracoes','/portal.html':'configuracoes',
};

export function pageAllowed(path:string,areas:string[],admin:boolean){
  if(admin||OPEN_PAGES.has(path)||!path.endsWith('.html')&&path!=='/')return true;
  const area=PAGE_AREA[path];
  return area?areas.includes(area):true;
}

export function cleanAreas(v:unknown){
  const list=Array.isArray(v)?v:[];
  return [...new Set(list.filter((a):a is string=>typeof a==='string'&&AREA_KEYS.includes(a)))];
}

// Perfis que podem usar o modo desenvolvedor (enviar e gerenciar sugestões).
export const DEV_PROFILES=['Administrador','Desenvolvedor'];
// Perfis que só um administrador pode dar a alguém.
export const PROTECTED_PROFILES=['Administrador','Desenvolvedor'];
