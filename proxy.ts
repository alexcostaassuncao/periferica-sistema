import {NextResponse,type NextRequest} from 'next/server';
import {SESSION_COOKIE} from './lib/session';
import {userFromToken} from './lib/auth';
import {AREA_KEYS,pageAllowed} from './lib/access';

// Protege o sistema inteiro: sem login, páginas redirecionam para /login.html e APIs respondem 401.
// O usuário logado é repassado às rotas pelos cabeçalhos x-pf-* (sempre recriados aqui, nunca aceitos do navegador).

const PUBLIC_PATHS=new Set(['/login.html','/api/auth/login','/api/auth/logout','/api/publications/run','/privacidade.html','/api/auth/forgot','/api/auth/reset','/redefinir-senha.html','/api/contracts/file','/formulario.html','/api/leads/intake','/aprovacao.html','/api/tasks/cliente']);
const PUBLIC_ASSET=/\.(js|css|svg|png|jpg|jpeg|webp|ico|woff2?)$/i;
const IDENTITY_HEADERS=['x-pf-user-id','x-pf-user-email','x-pf-user-name','x-pf-admin','x-pf-access','x-pf-areas','x-pf-squads'];
const ATTRIBUTION_COOKIE='pf-lead-attribution';
const ATTRIBUTION_KEYS=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid'] as const;

function localTestAccess(req:NextRequest){
  return process.env.LOCAL_AUTH_BYPASS==='1'
    &&process.env.NODE_ENV==='development'
    &&!process.env.TURSO_DATABASE_URL
    &&['localhost','127.0.0.1'].includes(req.nextUrl.hostname);
}

function withAttribution(req:NextRequest,response:NextResponse){
  if(req.cookies.has(ATTRIBUTION_COOKIE))return response;
  const attribution=Object.fromEntries(ATTRIBUTION_KEYS.map(key=>[key,req.nextUrl.searchParams.get(key)?.slice(0,120)||'']));
  if(!Object.values(attribution).some(Boolean))return response;
  response.cookies.set(ATTRIBUTION_COOKIE,JSON.stringify(attribution),{
    httpOnly:true,secure:req.nextUrl.protocol==='https:',sameSite:'lax',path:'/',maxAge:60*60*24*90,
  });
  return response;
}
function nextWithAttribution(req:NextRequest,headers:Headers){
  return withAttribution(req,NextResponse.next({request:{headers}}));
}

export async function proxy(req:NextRequest){
  const {pathname,search}=req.nextUrl;
  const headers=new Headers(req.headers);
  for(const name of IDENTITY_HEADERS)headers.delete(name);
  if(localTestAccess(req)&&pathname==='/login.html')return withAttribution(req,NextResponse.redirect(new URL('/inicio.html',req.url)));
  if(PUBLIC_PATHS.has(pathname)||PUBLIC_ASSET.test(pathname)&&!pathname.startsWith('/api/'))return nextWithAttribution(req,headers);

  if(localTestAccess(req)){
    headers.set('x-pf-user-id','local-test');
    headers.set('x-pf-user-email','teste%40localhost');
    headers.set('x-pf-user-name','Teste%20local');
    headers.set('x-pf-admin','1');
    headers.set('x-pf-access','Administrador');
    headers.set('x-pf-areas',AREA_KEYS.join(','));
    headers.set('x-pf-squads','');
    return nextWithAttribution(req,headers);
  }

  let user=null;
  try{user=await userFromToken(req.cookies.get(SESSION_COOKIE)?.value);}catch(e){console.error(e);}
  if(!user){
    if(pathname.startsWith('/api/'))return withAttribution(req,NextResponse.json({error:'Sua sessão expirou. Entre novamente.'},{status:401}));
    const login=new URL('/login.html',req.url);
    login.searchParams.set('next',pathname+search);
    return withAttribution(req,NextResponse.redirect(login));
  }
  headers.set('x-pf-user-id',user.id);
  headers.set('x-pf-user-email',encodeURIComponent(user.email));
  headers.set('x-pf-user-name',encodeURIComponent(user.name));
  headers.set('x-pf-admin',user.admin?'1':'0');
  headers.set('x-pf-access',encodeURIComponent(user.access));
  headers.set('x-pf-areas',user.areas.join(','));
  headers.set('x-pf-squads',user.squads.join(','));
  // Página de uma área que a pessoa não tem: volta para o Início.
  if(!pageAllowed(pathname,user.areas,user.admin))return withAttribution(req,NextResponse.redirect(new URL('/inicio.html?sem-acesso=1',req.url)));
  return nextWithAttribution(req,headers);
}

export const config={matcher:['/((?!_next/static|_next/image).*)']};
