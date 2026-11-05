import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage} from 'pdf-lib';

/* Gera o PDF do contrato a partir das linhas do modelo (ver marcação em modelos.ts).
   Layout simples, igual aos modelos em Word: A4, texto corrido, títulos em negrito, assinaturas no final. */

const A4={w:595.28,h:841.89},M={top:62,bottom:60,left:62,right:56};
const SIZE=10,LEAD=14.2,TITLE=12.5;
const INK=rgb(0.08,0.08,0.08),GRAY=rgb(0.42,0.42,0.42);

// As fontes padrão do PDF usam a tabela WinAnsi: troca o que não existe nela.
function clean(t:string){
  return t.replace(/[●▪■]/g,'•').replace(/[◦○]/g,'–').replace(/ /g,' ').replace(/[​﻿]/g,'')
    .replace(/[^\x20-\x7e -ÿ•–—‘’“”…€]/g,'');
}
type Run={text:string;bold:boolean};
// Largura letra por letra: o pdf-lib desconta o kerning ao medir, mas não ao desenhar.
// Medindo assim, a medida bate com o que aparece no PDF (senão palavras como "CONTRATADA" invadem o espaço seguinte).
const medidas=new WeakMap<PDFFont,Map<string,number>>();
function larg(f:PDFFont,t:string,size:number){
  let m=medidas.get(f);if(!m){m=new Map();medidas.set(f,m);}
  let total=0;
  for(const ch of t){let w=m.get(ch);if(w===undefined){w=f.widthOfTextAtSize(ch,1000);m.set(ch,w);}total+=w;}
  return total*size/1000;
}
// "texto **negrito** texto" → trechos
function runs(t:string):Run[]{
  const out:Run[]=[];const parts=clean(t).split('**');
  parts.forEach((p,i)=>{if(p)out.push({text:p,bold:i%2===1});});
  return out;
}

export async function contratoPdf(linhas:string[],titulo:string){
  const pdf=await PDFDocument.create();
  pdf.setTitle(titulo);pdf.setAuthor('Periférica Agência de Publicidade');pdf.setCreator('Sistema Periférica');
  const reg=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  let page:PDFPage=pdf.addPage([A4.w,A4.h]);let y=A4.h-M.top;
  const width=A4.w-M.left-M.right;
  const newPage=()=>{page=pdf.addPage([A4.w,A4.h]);y=A4.h-M.top;};
  const ensure=(h:number)=>{if(y-h<M.bottom)newPage();};

  // Escreve um parágrafo com quebra de linha automática (e justificado, como nos modelos).
  function paragraph(text:string,{x=M.left,w=width,size=SIZE,font,center=false,justify=true,color=INK,lead=LEAD}:{x?:number;w?:number;size?:number;font?:PDFFont;center?:boolean;justify?:boolean;color?:any;lead?:number}={}){
    // Palavras (sem os espaços). "glue" = a palavra cola na anterior (troca de negrito no meio da palavra).
    type W={t:string;f:PDFFont;w:number;glue:boolean};
    const words:W[]=[];let pendingSpace=false;
    for(const r of runs(text)){
      const f=font||(r.bold?bold:reg);
      for(const t of r.text.split(/(\s+)/)){
        if(!t)continue;
        if(/^\s+$/.test(t)){pendingSpace=true;continue;}
        words.push({t,f,w:larg(f,t,size),glue:words.length>0&&!pendingSpace});pendingSpace=false;
      }
    }
    const spaceW=larg(reg,' ',size);
    // Quebra em linhas: largura = palavras + um espaço normal entre elas.
    const lines:W[][]=[];let cur:W[]=[],cw=0;
    for(const wd of words){
      const add=(cur.length&&!wd.glue?spaceW:0)+wd.w;
      if(cur.length&&cw+add>w&&!wd.glue){lines.push(cur);cur=[];cw=0;}
      cur.push(wd);cw+=(cur.length>1&&!wd.glue?spaceW:0)+wd.w;
    }
    if(cur.length)lines.push(cur);
    lines.forEach((ln,i)=>{
      ensure(lead);
      const last=i===lines.length-1;
      const gaps=ln.filter((p,k)=>k>0&&!p.glue).length;
      const wordsW=ln.reduce((a,p)=>a+p.w,0);
      const natural=wordsW+gaps*spaceW;
      // Justificado: o espaço que sobra é dividido entre as palavras (nunca menor que um espaço normal).
      const gap=justify&&!last&&!center&&gaps?Math.max(spaceW,(w-wordsW)/gaps):spaceW;
      let cx=center?x+(w-natural)/2:x;
      ln.forEach((p,k)=>{
        if(k>0&&!p.glue)cx+=gap;
        // O espaço real vai junto da palavra (copiar/pesquisar no PDF funciona direito).
        const sp=k<ln.length-1&&!ln[k+1].glue?' ':'';
        page.drawText(p.t+sp,{x:cx,y:y-size,size,font:p.f,color});cx+=p.w;
      });
      y-=lead;
    });
  }

  for(const raw of linhas){
    const l=raw??'';
    if(!l.trim()){y-=LEAD*0.55;continue;}
    if(l.startsWith('#T ')){ensure(TITLE*2);paragraph(l.slice(3),{size:TITLE,font:bold,center:true,lead:TITLE*1.35});continue;}
    if(l.startsWith('#S ')){paragraph(l.slice(3),{size:SIZE+1,font:bold,center:true});continue;}
    if(l.startsWith('## ')){ensure(LEAD*3);y-=3;paragraph(l.slice(3),{font:bold,justify:false});y-=2;continue;}
    if(l.startsWith('### ')){ensure(LEAD*2);y-=2;paragraph(l.slice(4),{font:bold,justify:false});continue;}
    if(l.startsWith('- ')){
      ensure(LEAD);page.drawText('•',{x:M.left+6,y:y-SIZE,size:SIZE,font:reg,color:INK});
      paragraph(l.slice(2),{x:M.left+18,w:width-18});continue;
    }
    if(l.startsWith('> ')){paragraph(l.slice(2),{x:M.left+24,w:width-24});continue;}
    if(l.startsWith('@assinatura ')){
      const [nome,doc]=l.slice(12).split('|');
      ensure(LEAD*5);y-=LEAD*2.2;
      page.drawLine({start:{x:M.left,y},end:{x:M.left+300,y},thickness:.7,color:INK});y-=4;
      paragraph(nome,{font:bold,justify:false});if(doc)paragraph(doc,{justify:false,color:GRAY});
      continue;
    }
    paragraph(l);
  }

  // Rodapé com numeração de páginas
  const pages=pdf.getPages();
  pages.forEach((p,i)=>{const t=`${titulo} – página ${i+1} de ${pages.length}`;const w=larg(reg,clean(t),7.5);
    p.drawText(clean(t),{x:(A4.w-w)/2,y:28,size:7.5,font:reg,color:GRAY});});
  return pdf.save();
}
