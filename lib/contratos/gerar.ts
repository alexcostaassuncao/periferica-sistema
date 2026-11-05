import {MODELOS,modeloDoContrato} from './modelos';
import {contratoPdf} from './pdf';

// Junta os dados do contrato (tabela) com os do formulário e gera o PDF.
export function dadosDoContrato(c:any){
  let d:any={};try{d=JSON.parse(c.data||'{}');}catch{}
  return {razao_social:c.company,documento:c.document,representante:c.contact_name,email_socio:c.email,telefone:c.phone,...d};
}
export function nomeArquivo(c:any){
  const base=String(c.company||'cliente').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
  return `Contrato-${base}.pdf`;
}
export async function gerarPdf(c:any){
  const modelo=modeloDoContrato(c.kind,c.model);
  if(!modelo)throw Error('Ainda não há modelo de contrato para "'+c.model+'". Modelos disponíveis: planos de Gestão, Website e E-commerce.');
  const linhas=MODELOS[modelo].montar(dadosDoContrato(c));
  return contratoPdf(linhas,'Contrato '+MODELOS[modelo].nome);
}
