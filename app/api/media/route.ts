import {cloudinaryReady,fileInfo,signUpload} from '../../../lib/cloudinary';
import {sameOrigin} from '../../../lib/auth';
// Mídias das publicações: valida e devolve a assinatura para o navegador enviar direto ao Cloudinary
// (a Vercel limita o corpo das requisições a 4,5 MB, então o arquivo não passa pelo servidor).
export async function POST(req:Request){
  if(!sameOrigin(req))return Response.json({error:'Origem inválida.'},{status:403});
  if(!cloudinaryReady())return Response.json({error:'Armazenamento de mídias ainda não configurado (CLOUDINARY_* na Vercel).'},{status:503});
  const file=await fileInfo(req);
  // purpose: publicacao (padrão) · sugestao (prints) · tarefa (referências e entregas) · ata (anexos de reunião, aceita PDF)
  const purpose=new URL(req.url).searchParams.get('purpose')||'publicacao';
  const video=file.type.startsWith('video/'),pdf=file.type==='application/pdf';
  const okType=/^image\/(png|jpeg|webp)$|^video\/(mp4|quicktime)$/.test(file.type)||pdf&&purpose==='ata';
  if(!okType)return Response.json({error:purpose==='ata'?'Use PDF, PNG ou JPG.':'Use imagens PNG, JPG ou WebP, ou vídeos MP4 e MOV.'},{status:400});
  if(purpose==='sugestao'&&video)return Response.json({error:'Nas sugestões, envie só imagens.'},{status:400});
  if(purpose==='ata'&&video)return Response.json({error:'Na ata, envie PDF ou imagem.'},{status:400});
  if(!(file.size>0)||file.size>(video?100:20)*1024*1024)return Response.json({error:video?'O limite é 100 MB por vídeo.':'O limite é 20 MB por arquivo.'},{status:413});
  const folder={sugestao:'periferica/sugestoes',tarefa:'periferica/tarefas',ata:'periferica/atas'}[purpose]||'periferica/publicacoes';
  // PDF vai pelo endpoint de imagem do Cloudinary (que aceita PDF).
  return Response.json({upload:await signUpload({folder,video})},{headers:{'Cache-Control':'no-store'}});
}
