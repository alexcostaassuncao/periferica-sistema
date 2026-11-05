import {database} from '../../../../db/raw';
import {sha256} from '../../../../lib/session';
import {gerarPdf,nomeArquivo} from '../../../../lib/contratos/gerar';

// Link público enviado ao cliente (WhatsApp). Só funciona com o código certo e dentro do prazo.
function aviso(msg:string){
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contrato</title>
<body style="font-family:system-ui;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px">
<div><h2 style="color:#ff580b">Periférica</h2><p>${msg}</p></div></body>`,{status:404,headers:{'Content-Type':'text/html; charset=utf-8'}});
}

export async function GET(req:Request){
  const t=new URL(req.url).searchParams.get('t')||'';
  if(!/^[0-9a-f]{48}$/.test(t))return aviso('Link inválido.');
  const c:any=await database().prepare("SELECT * FROM contracts WHERE share_hash=? AND share_expires>? AND status<>'canc'").bind(await sha256(t),Date.now()).first();
  if(!c)return aviso('Este link expirou. Peça um novo link para a equipe da Periférica.');
  const pdf=await gerarPdf(c);
  return new Response(Buffer.from(pdf),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Robots-Tag':'noindex',
    'Content-Disposition':`inline; filename="${nomeArquivo(c)}"`}});
}
