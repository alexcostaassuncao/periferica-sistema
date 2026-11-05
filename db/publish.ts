import {database} from './raw';
import {accountToken,graph,MetaError,GRAPH} from './social';

// Motor de publicação. Cada publicação gera um "destino" por rede (publication_targets),
// processado de forma independente: se o Facebook falhar, o Instagram continua.
//
// Estados do destino:
//   queued      aguardando o horário
//   processing  a Meta está processando a mídia (vídeos levam alguns minutos)
//   publishing  a chamada final foi feita; aguardando confirmação
//   published   no ar
//   unconfirmed a chamada final pode ter funcionado, mas a Meta não respondeu. NÃO é reenviado
//               automaticamente para não duplicar: alguém confere no perfil e marca.
//   failed      erro definitivo (ver campo error)
//   cancelled   cancelado antes do envio

export type Format='post'|'carousel'|'reels'|'stories';
export type MediaItem={url:string;kind:'image'|'video';width?:number;height?:number};
export const FORMATS:Format[]=['post','carousel','reels','stories'];
const MAX_ATTEMPTS=6;

// ---------- validação ----------
export function publicMediaUrl(raw:string,siteHost:string){
  let u:URL;try{u=new URL(raw);}catch{throw Error('Link de mídia inválido.');}
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname===siteHost||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(u.hostname))
    throw Error('Use um link HTTPS público e direto da mídia (por exemplo, o enviado pelo próprio sistema).');
  return u.href;
}

export function validateMedia(format:Format,media:MediaItem[],networks:string[]){
  if(!media.length)throw Error('Adicione pelo menos uma mídia.');
  const videos=media.filter(m=>m.kind==='video').length;
  if(format==='carousel'){
    if(media.length<2||media.length>10)throw Error('O carrossel precisa de 2 a 10 mídias.');
    if(videos&&networks.includes('facebook'))throw Error('No Facebook o carrossel aceita só imagens. Remova os vídeos ou desmarque o Facebook.');
  }else if(media.length>1)throw Error('Este formato aceita uma mídia só. Para várias, use Carrossel.');
  if(format==='reels'&&media[0].kind!=='video')throw Error('Reels precisa de um vídeo.');
  if(format==='post'&&media[0].kind==='video'&&networks.includes('instagram'))throw Error('No Instagram, vídeo no feed é publicado como Reels. Escolha o formato Reels.');
}

// Ajusta mídias do Cloudinary ao tamanho que cada formato pede (feed 4:5, Stories/Reels 9:16).
export function adaptMedia(item:MediaItem,format:Format){
  let u:URL;try{u=new URL(item.url);}catch{return item.url;}
  if(u.hostname!=='res.cloudinary.com'||!u.pathname.includes('/upload/'))return item.url;
  const vertical=format==='reels'||format==='stories';
  let t:string;
  if(item.kind==='video')t=vertical?'c_pad,w_1080,h_1920,b_black,f_mp4,vc_h264,ac_aac':'w_1080,c_limit,f_mp4,vc_h264,ac_aac';
  else if(vertical)t='c_pad,w_1080,h_1920,b_black,f_jpg,q_90';
  else{
    const ratio=Number(item.height)/Number(item.width);
    const h=ratio>0&&Math.abs(ratio-4/3)<0.02?1440:ratio>1.26?1350:0;
    t=h?'c_pad,w_1080,h_'+h+',b_white,f_jpg,q_90':ratio>0&&ratio<0.52?'c_pad,w_1080,h_566,b_white,f_jpg,q_90':'w_1080,c_limit,f_jpg,q_90';
  }
  u.pathname=u.pathname.replace('/upload/','/upload/'+t+'/');
  return u.href;
}

// ---------- adaptadores ----------
type Ctx={pub:any;target:any;media:MediaItem[];token:string;account:any;state:any;
  save:(patch:Record<string,any>)=>Promise<void>;
  beforeIrreversible:()=>Promise<void>};
type Result={done:true;externalId:string;permalink?:string}|{done:false};

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

// Instagram: cria "containers", espera a Meta processar e publica. Um container só pode ser
// publicado uma vez, então repetir a etapa final nunca duplica o post.
async function instagram(c:Ctx):Promise<Result>{
  const ig=c.account.external_id,format=c.pub.format as Format;
  const container=async(item:MediaItem,extra:Record<string,string>)=>{
    const p:Record<string,string>={...extra};
    const url=adaptMedia(item,format);
    if(item.kind==='video'){p.video_url=url;if(!p.media_type)p.media_type='VIDEO';}else p.image_url=url;
    const d=await graph(ig+'/media',c.token,p);if(!d.id)throw new MetaError('A Meta não devolveu o identificador da mídia.');return String(d.id);
  };
  const statusOf=async(id:string)=>(await graph(id,c.token,{fields:'status_code'},'GET')).status_code as string;

  if(!c.target.container_id){
    let id:string;
    if(format==='carousel'){
      const children:string[]=c.state.children||[];
      for(let i=children.length;i<c.media.length;i++){
        const item=c.media[i];
        children.push(await container(item,{is_carousel_item:'true',...(item.kind==='video'?{media_type:'VIDEO'}:{})}));
        await c.save({step:JSON.stringify({children})});
      }
      for(const ch of children){const s=await statusOf(ch);if(s==='ERROR'||s==='EXPIRED')throw new MetaError('A Meta não conseguiu processar uma das mídias do carrossel. Confira formato e tamanho.');if(s!=='FINISHED')return {done:false};}
      id=String((await graph(ig+'/media',c.token,{media_type:'CAROUSEL',children:children.join(','),caption:c.pub.caption})).id);
    }else if(format==='reels')id=await container(c.media[0],{media_type:'REELS',caption:c.pub.caption,share_to_feed:'true'});
    else if(format==='stories')id=await container(c.media[0],{media_type:'STORIES'});
    else id=await container(c.media[0],{caption:c.pub.caption});
    c.target.container_id=id;await c.save({container_id:id,status:'processing'});
  }

  // Vídeos levam um tempo: espera até ~25 s nesta rodada, senão continua na próxima.
  let s='';
  for(let i=0;i<6;i++){s=await statusOf(c.target.container_id);if(s!=='IN_PROGRESS')break;await sleep(5000);}
  if(s==='PUBLISHED')return {done:true,externalId:c.target.external_id||c.target.container_id};
  if(s==='ERROR'||s==='EXPIRED')throw new MetaError('A Meta não conseguiu processar a mídia. Confira o link, o formato e a duração.');
  if(s!=='FINISHED')return {done:false};
  await c.beforeIrreversible();
  const d=await graph(ig+'/media_publish',c.token,{creation_id:c.target.container_id});
  const mediaId=String(d.id);
  let permalink='';try{permalink=(await graph(mediaId,c.token,{fields:'permalink'},'GET')).permalink||'';}catch{}
  return {done:true,externalId:mediaId,permalink};
}

// Facebook (Página). As chamadas finais publicam na hora e não têm como ser "conferidas" depois,
// por isso são precedidas de beforeIrreversible() (que marca o destino como "publishing").
async function facebook(c:Ctx):Promise<Result>{
  const page=c.account.external_id,format=c.pub.format as Format,item=c.media[0];
  const url=(m:MediaItem)=>adaptMedia(m,format);

  // Envio de vídeo em 3 etapas (Reels e Stories em vídeo): start → upload por link → finish.
  const resumable=async(edge:'video_reels'|'video_stories',finish:Record<string,string>)=>{
    let videoId=c.state.video_id as string|undefined;
    if(!videoId){
      const s=await graph(page+'/'+edge,c.token,{upload_phase:'start'});
      videoId=String(s.video_id);
      const r=await fetch('https://rupload.facebook.com/video-upload/'+GRAPH.split('/').pop()+'/'+videoId,{method:'POST',headers:{Authorization:'OAuth '+c.token,file_url:url(item)},signal:AbortSignal.timeout(60000)});
      const up:any=await r.json().catch(()=>({}));
      if(!r.ok||!up.success)throw new MetaError('O Facebook não conseguiu baixar o vídeo. Confira se o link é público e o arquivo é MP4.');
      await c.save({step:JSON.stringify({video_id:videoId})});
    }
    await c.beforeIrreversible();
    const f=await graph(page+'/'+edge,c.token,{upload_phase:'finish',video_id:videoId,...finish});
    if(f.success===false)throw new MetaError('O Facebook recusou a finalização do vídeo.');
    return {videoId,postId:f.post_id?String(f.post_id):''};
  };

  if(format==='reels'){
    const {videoId}=await resumable('video_reels',{video_state:'PUBLISHED',description:c.pub.caption});
    return {done:true,externalId:videoId,permalink:'https://www.facebook.com/reel/'+videoId};
  }
  if(format==='stories'){
    if(item.kind==='video'){const {videoId,postId}=await resumable('video_stories',{});return {done:true,externalId:postId||videoId,permalink:'https://www.facebook.com/'+page};}
    let photoId=c.state.photo_id as string|undefined;
    if(!photoId){photoId=String((await graph(page+'/photos',c.token,{url:url(item),published:'false'})).id);await c.save({step:JSON.stringify({photo_id:photoId})});}
    await c.beforeIrreversible();
    const d=await graph(page+'/photo_stories',c.token,{photo_id:photoId});
    return {done:true,externalId:String(d.post_id||photoId),permalink:'https://www.facebook.com/'+page};
  }
  if(format==='carousel'){
    // Fotos enviadas como "não publicadas" e depois anexadas num único post.
    const ids:string[]=c.state.photos||[];
    for(let i=ids.length;i<c.media.length;i++){
      ids.push(String((await graph(page+'/photos',c.token,{url:url(c.media[i]),published:'false'})).id));
      await c.save({step:JSON.stringify({photos:ids})});
    }
    const p:Record<string,string>={message:c.pub.caption};
    ids.forEach((id,i)=>p['attached_media['+i+']']=JSON.stringify({media_fbid:id}));
    await c.beforeIrreversible();
    const d=await graph(page+'/feed',c.token,p);
    return {done:true,externalId:String(d.id),permalink:'https://www.facebook.com/'+d.id};
  }
  // post simples
  await c.beforeIrreversible();
  if(item.kind==='video'){
    const d=await graph(page+'/videos',c.token,{file_url:url(item),description:c.pub.caption});
    return {done:true,externalId:String(d.id),permalink:'https://www.facebook.com/'+page+'/videos/'+d.id};
  }
  const d=await graph(page+'/photos',c.token,{url:url(item),message:c.pub.caption});
  const postId=String(d.post_id||d.id);
  return {done:true,externalId:postId,permalink:'https://www.facebook.com/'+postId};
}

const ADAPTERS:Record<string,(c:Ctx)=>Promise<Result>>={instagram,facebook};

// ---------- fila ----------
export async function processTarget(id:string){
  const db=database();const now=Date.now();
  const target:any=await db.prepare(`UPDATE publication_targets SET lease_until=?,updated_at=?
    WHERE id=? AND status IN ('queued','processing','publishing') AND lease_until<?
    AND (SELECT due_at FROM publications WHERE publications.id=publication_id)<=? RETURNING *`).bind(now+150000,now,id,now,now).first();
  if(!target)return;
  const save=async(patch:Record<string,any>)=>{
    const keys=Object.keys(patch);
    await db.prepare(`UPDATE publication_targets SET ${keys.map(k=>k+'=?').join(',')},updated_at=? WHERE id=?`).bind(...keys.map(k=>patch[k]),Date.now(),id).run();
    Object.assign(target,patch);
  };
  let irreversible=false;
  try{
    const pub:any=await db.prepare('SELECT * FROM publications WHERE id=?').bind(target.publication_id).first();
    if(!pub)throw Error('A publicação foi removida.');
    // Uma chamada final do Facebook sem resposta não é repetida automaticamente (evita post duplicado).
    if(target.status==='publishing'&&target.network!=='instagram'){await save({status:'unconfirmed',error:'A Meta não confirmou o envio. Confira na Página: se saiu, marque como publicado; se não, tente de novo.'});return;}
    const {account,token}=await accountToken(target.account_id);
    if(account.client_id!==pub.client_id)throw Error('A conta foi desvinculada deste cliente. Vincule de novo e reenvie.');
    const adapter=ADAPTERS[target.network];if(!adapter)throw Error('Rede ainda não suportada.');
    let state:any={};try{state=JSON.parse(target.step||'{}');}catch{}
    const result=await adapter({pub,target,media:JSON.parse(pub.media),token,account,state,save,
      beforeIrreversible:async()=>{irreversible=true;await save({status:'publishing',attempts:Number(target.attempts)+1});}});
    if(result.done)await save({status:'published',external_id:result.externalId,permalink:result.permalink||null,error:null});
  }catch(e){
    const err=e instanceof MetaError?e:null;
    const message=e instanceof Error?e.message:'Falha na publicação.';
    const noResponse=err?.transient&&err.code===undefined;
    if(irreversible&&noResponse&&target.network!=='instagram')await save({status:'unconfirmed',error:'A Meta não respondeu na etapa final. Confira na Página antes de tentar de novo.'});
    else if(err?.transient&&Number(target.attempts)<MAX_ATTEMPTS)await save({status:target.container_id||target.step?'processing':'queued',attempts:Number(target.attempts)+1,error:message+' Nova tentativa automática em breve.'});
    else await save({status:'failed',error:message});
  }finally{
    await db.prepare('UPDATE publication_targets SET lease_until=0,updated_at=? WHERE id=?').bind(Date.now(),id).run();
  }
}

export async function processPublication(publicationId:string){
  const rows=await database().prepare("SELECT id FROM publication_targets WHERE publication_id=? AND status IN ('queued','processing','publishing')").bind(publicationId).all();
  await Promise.all((rows.results as any[]).map(r=>processTarget(r.id)));
}

export async function runDue(limit=8){
  const now=Date.now();
  const rows=await database().prepare(`SELECT t.id FROM publication_targets t JOIN publications p ON p.id=t.publication_id
    WHERE p.due_at<=? AND t.status IN ('queued','processing','publishing') AND t.lease_until<? ORDER BY p.due_at LIMIT ?`).bind(now,now,limit).all();
  const ids=(rows.results as any[]).map(r=>r.id);
  // Em paralelo, de 4 em 4, para caber no tempo de uma execução.
  for(let i=0;i<ids.length;i+=4)await Promise.all(ids.slice(i,i+4).map(processTarget));
  return ids.length;
}
