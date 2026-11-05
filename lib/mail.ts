import nodemailer from 'nodemailer';

// Envio de email. Usa o servidor SMTP próprio (cPanel) quando SMTP_HOST está definido;
// senão, usa o Resend (RESEND_API_KEY). Em ambos, EMAIL_FROM é o remetente.
const env=process.env;

export function mailReady(){return Boolean(env.EMAIL_FROM&&(env.SMTP_HOST&&env.SMTP_USER&&env.SMTP_PASSWORD||env.RESEND_API_KEY));}

export type Anexo={filename:string;content:Uint8Array;contentType?:string};
export async function sendMail(message:{to:string;subject:string;text:string;replyTo?:string;attachments?:Anexo[]}):Promise<boolean>{
  if(!mailReady())return false;
  try{
    if(env.SMTP_HOST){
      const port=Number(env.SMTP_PORT||465);
      const transport=nodemailer.createTransport({
        host:env.SMTP_HOST,port,
        secure:port===465, // 465 = SSL direto; 587 = STARTTLS
        auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},
        connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,
      });
      await transport.sendMail({from:env.EMAIL_FROM,to:message.to,subject:message.subject,text:message.text,replyTo:message.replyTo,
        attachments:message.attachments?.map(a=>({filename:a.filename,content:Buffer.from(a.content),contentType:a.contentType}))});
      return true;
    }
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM,to:[message.to],subject:message.subject,text:message.text,reply_to:message.replyTo,
      attachments:message.attachments?.map(a=>({filename:a.filename,content:Buffer.from(a.content).toString('base64')}))})});
    return r.ok;
  }catch(e){console.error('Falha no envio de email:',e);return false;}
}
