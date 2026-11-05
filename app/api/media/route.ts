import {cloudinaryReady,fileInfo,signUpload} from '../../../lib/cloudinary';
import {sameOrigin} from '../../../lib/auth';
// Mídias das publicações: valida e devolve a assinatura para o navegador enviar direto ao Cloudinary
// (a Vercel limita o corpo das requisições a 4,5 MB, então o arquivo não passa pelo servidor).
export async function POST(req:Request){
  if(!sameOrigin(req))return Response.json({error:'Origem inválida.'},{status:403});
  if(!cloudinaryReady())return Response.json({error:'Armazenamento de mídias ainda não configurado (CLOUDINARY_* na Vercel).'},{status:503});
  const file=await fileInfo(req);
  const video=file.type.startsWith('video/');
  if(!/^image\/(png|jpeg|webp)$|^video\/(mp4|quicktime)$/.test(file.type))return Response.json({error:'Use imagens PNG, JPG ou WebP, ou vídeos MP4 e MOV.'},{status:400});
  if(!(file.size>0)||file.size>(video?100:20)*1024*1024)return Response.json({error:video?'O limite é 100 MB por vídeo.':'O limite é 20 MB por imagem.'},{status:413});
  return Response.json({upload:await signUpload({folder:'periferica/publicacoes',video})},{headers:{'Cache-Control':'no-store'}});
}
