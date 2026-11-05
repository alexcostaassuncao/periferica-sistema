// Uploads vão do navegador direto ao Cloudinary (a Vercel limita requisições a 4,5 MB).
// O servidor só valida o arquivo e assina os parâmetros; o segredo nunca sai do servidor.

export function cloudinaryReady(){const e=process.env;return Boolean(e.CLOUDINARY_CLOUD_NAME&&e.CLOUDINARY_API_KEY&&e.CLOUDINARY_API_SECRET);}

export async function signUpload(options:{folder:string;video:boolean;format?:string}){
  const e=process.env;
  const params:Record<string,string>={public_id:options.folder+'/'+crypto.randomUUID(),timestamp:String(Math.floor(Date.now()/1000)),...(options.format?{format:options.format}:{})};
  const signing=Object.keys(params).sort().map(k=>k+'='+params[k]).join('&')+e.CLOUDINARY_API_SECRET;
  const signature=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1',new TextEncoder().encode(signing))),b=>b.toString(16).padStart(2,'0')).join('');
  return {
    url:'https://api.cloudinary.com/v1_1/'+encodeURIComponent(e.CLOUDINARY_CLOUD_NAME!)+'/'+(options.video?'video':'image')+'/upload',
    fields:{...params,api_key:e.CLOUDINARY_API_KEY!,signature},
  };
}

// Lê {name,type,size} enviados pelo navegador antes do upload.
export async function fileInfo(req:Request){
  const p:any=await req.json().catch(()=>({}));
  return {name:String(p.name||'arquivo').slice(0,200),type:String(p.type||''),size:Number(p.size)};
}
