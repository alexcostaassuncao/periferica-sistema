// Chamadas do agendador (GitHub Actions) vêm com Authorization: Bearer <CRON_SECRET>. Comparação em tempo constante.
export function cronAuthorized(req:Request){
  const secret=process.env.CRON_SECRET||'';
  const sent=req.headers.get('Authorization')||'';
  const expected='Bearer '+secret;
  if(secret.length<16||sent.length!==expected.length)return false;
  let diff=0;for(let i=0;i<sent.length;i++)diff|=sent.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
