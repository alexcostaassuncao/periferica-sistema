import {CONTRATADA} from './contratada';
import {dataBr,dataExtenso,numeroComExtenso,numeroExtenso,parseValor,valorComExtenso} from './extenso';

/* Modelos de contrato da Periférica (texto dos modelos da pasta 06 - CONTRATOS).
   O sistema troca apenas: dados do cliente, plano, valores, formas de pagamento, datas e multa.

   Marcação usada no texto (vira formatação no PDF):
     #T título    #S subtítulo    ## cláusula    ### subtítulo de seção
     - item       > parágrafo recuado     **negrito**     @assinatura Nome|Documento     linha vazia = espaço */

export type Modelo='gestao'|'site'|'ecommerce';
export type Dados=Record<string,any>;

// ---------- planos de Gestão (itens e preços sugeridos, tirados dos contratos já fechados) ----------
const ITENS_ADS=`CAMPANHAS ESTRATÉGICAS DE TRÁFEGO PAGO
Desenvolvimento de até 1 Campanha mensal.
CANAIS DE ATUAÇÃO
Meta ADS
Google ADS
IMPLANTAÇÃO DO MARKETING
Processo de recepção e Kick off;
Onboarding;
Estruturação e Planejamento;
Diagnóstico e Configurações das Contas;
Apresentação Estratégica da Campanha;
Desenvolvimento dos criativos da campanha;
Ativação da Campanha.
PLANO ESTRATÉGICO
Planejamento e Desenvolvimento mensal das campanhas.
PRODUÇÃO
Até 4 Criativos mensais;
Até 1 Vídeo mensal com edição profissional;
Criação das Copy e legendas dos anúncios;
Roteiro e legendas para os vídeos.
GESTÃO DO INVESTIMENTO PARA ANÚNCIOS
Mínimo de R$ 1.000,00
Máximo de R$ 5.000,00
ROTINA DE REUNIÕES
Check-up quinzenal de 30 minutos;
Reunião estratégica mensal de 1 hora;
Envio semanal de relatórios das campanhas.`;
const ITENS_SOCIAL_EXTRA=`SOCIAL MEDIA
8 Criativos mensais;
2 Vídeos mensais com edição profissional;
Criação das Copy e legendas dos anúncios;
Roteiro e legendas para os vídeos.`;
const ITENS_SMART=`CAMPANHAS ESTRATÉGICAS DE TRÁFEGO PAGO
Desenvolvimento de até 2 Campanhas mensais.
CANAIS DE ATUAÇÃO
Meta ADS
Google ADS
IMPLANTAÇÃO DO MARKETING
Processo de recepção e Kick off;
Onboarding;
Estruturação e Planejamento;
Diagnóstico e Configurações das Contas;
Apresentação Estratégica da Campanha;
Desenvolvimento dos criativos da campanha;
Ativação da Campanha.
PLANO ESTRATÉGICO
Planejamento e Desenvolvimento mensal das campanhas.
PRODUÇÃO
Até 8 Criativos mensais;
Até 2 Vídeos mensais com edição profissional;
Criação das Copy e legendas dos anúncios;
Roteiro e legendas para os vídeos.
GESTÃO DO INVESTIMENTO PARA ANÚNCIOS
Mínimo de R$ 2.000,00
Máximo de R$ 10.000,00
LANDING PAGE
1 Landing Page (página de vendas) inclusa no plano, no formato simplificada, constando apenas formulários de cadastro.
SUPORTE PARA CONVERSÃO DE VENDAS
Orientação e acompanhamento do time comercial;
Orientação/apoio para implantação de ferramentas necessárias para as campanhas (CRM, automações e atendimento, etc).
ROTINA DE REUNIÕES
Check-up semanal de 30 minutos;
Reunião estratégica mensal de 1 hora;
Envio semanal de relatórios das campanhas.`;
const ITENS_LIGHT=`CAMPANHAS ESTRATÉGICAS DE TRÁFEGO PAGO
Desenvolvimento de até 1 Campanha mensal.
CANAIS DE ATUAÇÃO
Meta ADS
Google ADS
IMPLANTAÇÃO DO MARKETING
Processo de recepção e Kick off;
Onboarding;
Estruturação e Planejamento;
Diagnóstico e Configurações das Contas;
Apresentação Estratégica da Campanha;
Desenvolvimento dos criativos da campanha;
Ativação da Campanha.
PLANO ESTRATÉGICO
Planejamento e desenvolvimento mensal das campanhas.
GESTÃO DO INVESTIMENTO PARA ANÚNCIOS
Mínimo de R$ 1.000,00
Máximo de R$ 5.000,00
ROTINA DE REUNIÕES
Check-up quinzenal de 30 minutos;
Reunião estratégica mensal de 1 hora;
Envio semanal de relatórios das campanhas.`;
const ITENS_SOCIAL=`CANAIS DE ATUAÇÃO
Meta ADS
Google ADS
IMPLANTAÇÃO DO MARKETING
Processo de recepção e Kick off;
Onboarding;
Estruturação e Planejamento;
Diagnóstico e Configurações das Contas;
Apresentação Estratégica da Campanha;
Desenvolvimento dos criativos da campanha;
Ativação da Campanha.
PLANO ESTRATÉGICO
Planejamento e desenvolvimento mensal
PRODUÇÃO TOTAL DO PLANO DE SOCIAL MEDIA:
Até 6 Criativos mensais;
Criação das Copy e legendas dos anúncios;
Roteiro e legendas para os vídeos.
ROTINA DE REUNIÕES
Check-up quinzenal de 30 minutos;
Reunião estratégica mensal de 1 hora;
Envio semanal de relatórios das campanhas.`;

// precos: modalidade → [implantação, mensal]. Ficam editáveis no formulário (valor personalizado).
export const PLANOS:Record<string,{itens:string;trafego:boolean;social:boolean;investMin:number;precos:Record<string,[number,number]>}>={
  'ADS PRO':{itens:ITENS_ADS,trafego:true,social:false,investMin:1000,precos:{Anual:[1590,1890],Semestral:[1790,1890]}},
  'ADS PRO + SOCIAL MEDIA':{itens:ITENS_ADS+'\n'+ITENS_SOCIAL_EXTRA,trafego:true,social:true,investMin:1000,precos:{Anual:[1590,2990],Semestral:[1790,2990]}},
  'SMART BUSINESS':{itens:ITENS_SMART,trafego:true,social:false,investMin:2000,precos:{Anual:[1590,2790],Semestral:[1790,2990]}},
  'TRÁFEGO LIGHT':{itens:ITENS_LIGHT,trafego:true,social:false,investMin:1000,precos:{Semestral:[750,1000],Anual:[750,1000]}},
  'SOCIAL MEDIA':{itens:ITENS_SOCIAL,trafego:false,social:true,investMin:0,precos:{Semestral:[0,400],Anual:[0,400]}},
  'PERSONALIZADO':{itens:ITENS_ADS,trafego:true,social:false,investMin:1000,precos:{}},
};
export const MODALIDADES:Record<string,number>={Mensal:1,Semestral:6,Anual:12};

// Multa rescisória escalonada usada nos contratos (por vigência).
export function multaPadrao(meses:number){
  if(meses>=12)return '1º mês ao 3º mês, multa rescisória correspondente a 40% (quarenta por cento) do valor remanescente do contrato.\nDo 4º mês ao 7º mês, multa rescisória correspondente a 30% (trinta por cento) do valor remanescente do contrato.\nDo 8º mês ao 11º mês, multa rescisória correspondente a 20% (vinte por cento) do valor remanescente do contrato.';
  if(meses>=6)return '1º mês ao 3º mês, multa rescisória correspondente a 40% (quarenta por cento) do valor remanescente do contrato.\nDo 4º mês ao 6º mês, multa rescisória correspondente a 30% (trinta por cento) do valor remanescente do contrato.';
  return '';
}

// ---------- utilidades ----------
const s=(v:any)=>String(v??'').trim();
const ou=(v:any,alt='____________')=>s(v)||alt;
const MES_PT=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function qualificacao(d:Dados){
  const end=[s(d.logradouro),s(d.numero)?'nº '+s(d.numero):'',s(d.complemento),s(d.bairro)?'Bairro '+s(d.bairro):'',s(d.cidade)?'Cidade de '+s(d.cidade):'',s(d.cep)?'CEP '+s(d.cep):''].filter(Boolean).join(', ');
  const doc=s(d.documento);const tipo=doc.replace(/\D/g,'').length===11?'CPF':'CNPJ';
  return `**CONTRATANTE:** ${ou(d.razao_social)}, ${tipo} ${ou(doc)}${s(d.nome_fantasia)?', Nome Fantasia '+s(d.nome_fantasia):''}, estabelecida na ${end||'____________'}, neste ato representada por ${ou(d.representante)}, CPF ${ou(d.cpf_representante)}${s(d.nascimento)?', data de nascimento '+dataBr(s(d.nascimento)):''}.`;
}
const contratadaLinha=`**CONTRATADA:** ${CONTRATADA.razao}, CNPJ ${CONTRATADA.cnpj}, estabelecida na ${CONTRATADA.endereco}, neste ato representada por ${CONTRATADA.representante}, CPF ${CONTRATADA.cpf}.`;
const localData=(d:Dados)=>`${CONTRATADA.cidade}, ${dataExtenso(s(d.data_contrato)||new Date().toISOString().slice(0,10))}.`;
const assinaturas=(d:Dados)=>[`@assinatura CONTRATADA: ${CONTRATADA.razao}|CNPJ ${CONTRATADA.cnpj}`,`@assinatura CONTRATANTE: ${ou(d.razao_social).toUpperCase()}|${s(d.documento)?(s(d.documento).replace(/\D/g,'').length===11?'CPF ':'CNPJ ')+s(d.documento):''}`];
// Itens do plano: linha em MAIÚSCULAS vira subtítulo, as outras viram tópicos.
function itensPlano(txt:string){
  return s(txt).split('\n').map(l=>l.trim()).filter(Boolean).map(l=>/^[^a-z]*[A-ZÀ-Ú]{3}[^a-z]*$/.test(l)||l.endsWith(':')&&l===l.toUpperCase()?'### '+l:'- '+l);
}

// ---------- GESTÃO DE MARKETING DIGITAL ----------
function gestao(d:Dados):string[]{
  const plano=PLANOS[s(d.plano)]||PLANOS['ADS PRO'];
  const trafego=d.tem_trafego??plano.trafego,social=d.tem_social??plano.social;
  const objeto=[trafego&&'Gestão de Campanhas de Tráfego Pago',social&&'Desenvolvimento de Social Media'].filter(Boolean).join(', ')||'Gestão de Marketing Digital';
  const meses=Number(d.vigencia_meses)||MODALIDADES[s(d.modalidade)]||6;
  const impl=parseValor(d.implantacao_valor),mensal=parseValor(d.mensal_valor),socialV=parseValor(d.social_valor);
  const invest=parseValor(d.invest_minimo)||plano.investMin;
  const L:string[]=[
    '#T CONTRATO DE PRESTAÇÃO DE SERVIÇO DE','#T GESTÃO DE MARKETING DIGITAL ESTRATÉGICO','',
    'Este contrato visa documentar a proposta de prestação de serviços apresentada pela CONTRATADA e aceite previamente pela CONTRATANTE, contendo todas as informações acerca da metodologia de trabalho, recursos necessários para a execução do serviço, bem como as descrições das condições de pagamento e prazos previamente definidos.','',
    contratadaLinha,'',qualificacao(d),'',
    '## CLÁUSULA PRIMEIRA: DA PRESTAÇÃO DE SERVIÇOS',
    `Este contrato tem como objetivo a prestação de serviços de ${objeto} para os canais da empresa e será desenvolvido conforme os pontos explicados logo abaixo:`,
    '- Gerenciamento das contas Meta Ads:',
    `> Instagram: ${s(d.instagram)}`,`> Facebook: ${s(d.facebook)}`,
    '- Ou fazendo a criação dos novos perfis em caso de não existência, manutenção e organização das informações específicas de cada canal;',
    '- A CONTRATADA não é responsável pelo monitoramento ou gestão das redes sociais, não sendo responsável por responder comentários e/ou mensagens enviados pelos usuários.',
    '- O acompanhamento do desempenho de cada campanha, assegurando a melhor cobertura dos públicos e/ou dos mercados objetivados, sendo de responsabilidade da CONTRATANTE o patrocínio dos posts e o pagamento do valor de mídia a ser utilizado;',
    '- A escolha de imagens de domínio público e criação de peças gráficas, quando não recebido material enviado pela CONTRATANTE, para uso nos posts dos canais: Facebook e Instagram;',
    '- O monitoramento do engajamento do público e produção de relatórios simples, mensais, baseados nos resultados apresentados pelas próprias plataformas.','',
    '## CLÁUSULA SEGUNDA: DAS CONDIÇÕES DA PRESTAÇÃO DOS SERVIÇOS',
    '### Item I - Obrigações da CONTRATADA',
    '1º - Desenvolver as campanhas para as plataformas digitais supramencionadas e de acordo com o plano contratado na Cláusula Quarta; A CONTRATADA compromete-se a envidar todos os esforços no sentido de preservar a imagem da CONTRATANTE tomando os cuidados necessários em especial atenção às disposições expressas no Código de Defesa do Consumidor. Para tanto, somente tomará a iniciativa de publicar materiais em nome da CONTRATANTE com sua prévia e expressa autorização quanto ao teor e a forma da comunicação, sendo ela responsável pelo que foi divulgado em suas redes sociais, e também a CONTRATANTE, por sua vez se compromete a fornecer elementos comprováveis sobre o(s) produto(s) e/ou serviço(s) a fim de que as criações textuais atendam os dispositivos do Código de Defesa do Consumidor e Código Brasileiro de Auto-regulamentação Publicitária.',
    '2º - A CONTRATADA não se responsabiliza por anúncios que violem as diretrizes das redes sociais e/ou do Google, que contenham materiais com produtos falsificados ou que estimulem ou incitem qualquer tipo de discriminação ou violência em razão de raça, sexo, religião, idade, entre outros que sejam contrários aos dispositivos legais ou constituam publicidade manifestamente ilícita, ilegal ou enganosa, podendo ocasionar bloqueios ou banimentos de perfis.',
    '3º - A CONTRATADA concorda em manter a confidencialidade de todas as informações trocadas, incluindo, mas não se limitando, a dados financeiros, acordos e parcerias comerciais, outras informações sobre negócios e de propriedade intelectual.',
    '### Item II - Obrigações da CONTRATANTE',
    '- Deverá fornecer todos os logins e senhas dos perfis profissionais e contas de anúncios para a CONTRATADA executar os serviços detalhados neste contrato.',
    '- Deverá fornecer a CONTRATADA todas as informações, elementos, fotos, ideias e objetivos necessários ao desenvolvimento da campanha até o dia 10 do mês que antecede o mês que será veiculado às campanhas desenvolvidas no planejamento.',
    '- A CONTRATANTE é livre para sugerir todo e qualquer conteúdo informativo de suas páginas, sendo ela integralmente responsável pelos efeitos provenientes destas informações, respondendo civil e criminalmente por atos contrários à lei, propaganda enganosa, atos obscenos e violação de direitos autorais.',
    '- Quaisquer alterações ou demandas extras ao planejamento da campanha deverão ser solicitadas com 48 horas de antecedência.',
    '- Todo material enviado para aprovação deverá ser avaliado pela CONTRATANTE, da qual se não se manifestar no prazo de até 24 horas após o envio, será considerado como aprovado e publicado em suas redes, conforme contratado.',
    '- Deverá avaliar, ajustar e aprovar o Planejamento das campanhas no prazo de até 48 horas após o envio para aprovação, caso não se manifestar nesse período o mesmo será considerado como aprovado e não será possível fazer alterações posteriores.',
    '- A CONTRATANTE se compromete a não aliciar, contratar, abordar ou incentivar direta ou indiretamente qualquer colaborador, prestador de serviço ou parceiro da CONTRATADA a se desligar da equipe para prestar serviços, seja como empregado, prestador de serviços autônomo ou qualquer outra forma de contratação, sem a expressa autorização da CONTRATADA. Essa restrição se aplica durante toda a vigência do contrato e permanece em vigor por um período de 6 (seis) meses após o encerramento da prestação de serviços. Caso a CONTRATANTE descumpra esta cláusula, estará sujeito ao pagamento de uma multa correspondente a 4 vezes o salário do colaborador. Essa medida visa proteger o investimento da CONTRATADA no treinamento e desenvolvimento de sua equipe, garantindo a continuidade e qualidade dos serviços prestados.',
    '- A CONTRATANTE se compromete a adotar todas as medidas de segurança para proteger suas contas e perfis de redes sociais e Google, implantando verificação de dois fatores pelo Google Authenticator, podendo tirar qualquer dúvida ou orientação com a CONTRATADA de como proceder com a implantação. A CONTRATADA não se responsabiliza por qualquer perda de perfil ou invasão de contas, uma vez que as medidas de segurança são de responsabilidade do CONTRATANTE.',
  ];
  if(trafego)L.push(
    `- A CONTRATANTE está ciente da necessidade de destinar mensalmente o valor mínimo de ${valorComExtenso(invest)} para investimento em cada campanha de tráfego pago, abrangendo as plataformas Meta Ads (Facebook e Instagram) e Google Ads, valor este que será gerido pela CONTRATADA conforme as estratégias previamente definidas, com o objetivo de se obter os melhores resultados.`,
    '- A CONTRATANTE declara estar ciente de que os resultados obtidos com as campanhas estão diretamente relacionados ao valor investido, sendo este um fator determinante para o alcance e a performance das ações. Adicionalmente, reconhece que cada plataforma publicitária possui recomendações e diretrizes específicas quanto ao orçamento mínimo necessário para garantir entregas consistentes, testes de variações, otimizações e resultados relevantes.',
    '- O não cumprimento do investimento mínimo acordado poderá comprometer significativamente os resultados esperados e exime a CONTRATADA de qualquer responsabilidade quanto à performance insatisfatória das campanhas por limitação orçamentária imposta pela CONTRATANTE.');
  L.push('',
    '## CLÁUSULA TERCEIRA: PRAZOS',
    `1º - O início da prestação do serviço será contado a partir do dia ${dataBr(s(d.inicio))||'__/__/____'} e findará no dia ${dataBr(s(d.termino))||'__/__/____'}.`,
    '2º - A renovação acontecerá até 30 dias após a data de término do contrato, tal renovação será tratada entre as partes antes do vencimento do contrato para determinação dos reajustes, permanecendo em vigor todas as cláusulas do contrato até a sua efetiva renovação ou revogação. O Contrato se renovará de forma automática seguindo as mesmas cláusulas e período caso nenhuma das partes se manifeste em até 45 dias após o término do contrato.','',
    '## CLÁUSULA QUARTA: PLANO CONTRATADO',
    `### Plano ${s(d.plano)||'ADS PRO'}`,'Este plano contempla os seguintes serviços:',
    ...itensPlano(s(d.itens_plano)||plano.itens),
    '### OBSERVAÇÕES:',
    '- Caso necessite criativos ou serviços extras para a execução da campanha e melhor performance, estes serão cobrados conforme tabela de preços da CONTRATADA.',
    ...(trafego?['- Quando ultrapassado o teto de gestão de investimento mensal, será adicionado na mensalidade o valor referente a 10% sobre o total investimento para anúncios a título de gestão do investimento. O consultor sempre irá informar sobre os valores excedentes.']:[]),
    '- Demandas extras que excedam a quantidade do plano deverão ser solicitadas com 48h de antecedência e será cobrado o valor individual conforme tabela de preços da CONTRATADA. Demandas que não são do âmbito digital ou não façam parte deste contrato serão orçadas cobradas conforme tabela de preços da CONTRATADA.',
    ...(trafego?['- Não está incluso no valor mensal da prestação do serviço os valores destinados para anúncios patrocinados, sendo a CONTRATANTE responsável pelos pagamentos dos créditos para os mesmos.']:[]),
    '- É permitido até 3 (três) solicitações de alterações nos criativos produzidos, após será considerado novo criativo, o qual será cobrado pelo serviço conforme tabela de preço atualizada pela CONTRATADA.',
    '- A CONTRATADA repassará para a CONTRATANTE os valores de licença de uso de ferramentas digitais necessárias para a execução dos trabalhos, como por exemplo: ferramentas de e-mail marketing, landing pages, servidor de hospedagem e outros planos para atender as necessidades das campanhas, e a mesma será responsável pelos pagamentos ou ressarcimentos à CONTRATADA.',
    '- A CONTRATANTE é responsável pelo pagamento dos serviços de sessão de fotos ou vídeos profissionais, sendo dona do material desenvolvido, podendo referido material ser utilizado nas redes sociais.',
    '- Captação de fotos e vídeos simples feitos pela CONTRATANTE com orientação da CONTRATADA.',
    '- Não está incluso os valores para desenvolvimento de site ou landing pages extras, sendo referidos serviços cobrados conforme tabela de preços da CONTRATADA.',
    '- É de responsabilidade da CONTRATANTE o pagamento dos custos de deslocamento, hospedagens e dias de trabalho de cada pessoa da CONTRATADA quando feito reuniões ou captação de materiais fora da sede da CONTRATADA, sendo cobrado os valores na fatura do mês subsequente.',
    '- Todos os materiais produzidos, vídeos e fotos captados, serão de uso exclusivo da CONTRATADA para execução do objetivo deste contrato.',
    '- Após encerramento do contrato, a CONTRATADA irá deletar todos os arquivos de seus servidores, não sendo responsável por backups, assim como durante a vigência do contrato, todo material enviado pela CONTRATANTE será considerado como cópias, sendo a CONTRATANTE responsável pelo armazenamento dos materiais originais.',
    '- Os serviços de atendimento e suporte pela CONTRATADA estarão disponíveis em horário comercial, de segunda à sexta-feira, das 8h às 12h e das 13h às 17h, exceto feriados.',
    ...(s(d.observacoes_extras)?s(d.observacoes_extras).split('\n').filter(Boolean).map(l=>'- '+l):[]),'',
    '## CLÁUSULA QUINTA: VALORES E FORMAS DE PAGAMENTO',
    `1º - MODALIDADE DO PLANO: ${ou(d.modalidade,'SEMESTRAL').toUpperCase()}`);
  let n=2;
  if(impl>0)L.push('',`${n++}º - IMPLANTAÇÃO:`,`> VALOR: ${valorComExtenso(impl)}`,`> FORMA DE PAGAMENTO: ${ou(d.implantacao_forma,'Boleto')}`,
    `> Obs: ${s(d.implantacao_obs)||'Quando a forma de pagamento for boleto, o vencimento será no dia '+(dataBr(s(d.implantacao_vencimento))||'__/__/____')+'.'}`,
    '> Tal valor refere-se à implantação do marketing. A IMPLANTAÇÃO é todo o processo inicial para que o trabalho de marketing seja possível de ser realizado, essa fase consiste em coleta de briefing, análise de briefing, configurações de contas, análise dos canais, estudo da empresa, estudo de mercado, brainstorming para as estratégias, desenvolvimento de escopo de campanhas, entre outros.');
  const dia=Number(d.mensal_dia)||10;
  L.push('',`${n++}º - ${trafego?'GESTÃO MENSAL DAS CAMPANHAS':'GESTÃO MENSAL DE SOCIAL MEDIA'}${trafego&&social&&!socialV?' + SOCIAL MEDIA':''}:`,`> VALOR MENSAL: ${valorComExtenso(mensal)}`,`> FORMA DE PAGAMENTO: ${ou(d.mensal_forma,'Boleto')}`,
    `> Obs: ${s(d.mensal_obs)||`Quando a forma de pagamento for boleto, o vencimento será no ${dia}º (${numeroExtenso(dia)}) dia do mês subsequente à data deste contrato.`}`);
  if(socialV>0)L.push('',`${n++}º - DESENVOLVIMENTO DE SOCIAL MEDIA:`,`> VALOR MENSAL: ${valorComExtenso(socialV)}`,`> FORMA DE PAGAMENTO: ${ou(d.mensal_forma,'Boleto')}`);
  L.push('> A GESTÃO DE MARKETING DIGITAL acontece a partir da data de vigência deste contrato e independe da implantação, pois trata-se de trabalhos diferentes, sendo cobrado o valor mensal dos serviços sempre no dia '+dia+' do mês posterior à execução dos trabalhos.',
    `${n}º - O não pagamento do serviço prestado sujeitará à CONTRATANTE a um aviso prévio de 5 (cinco) dias para a quitação, caso não ocorra o pagamento os serviços serão paralisados. Caso permaneça sem o pagamento por mais de 20 (vinte) dias será considerado rescisão de contrato sem aviso prévio, acarretando na cobrança do valor devido, além do valor referente aos dias de aviso prévio, bem como a cobrança da multa de rescisão do contrato. Não ocorrendo o pagamento dos valores devidos, a CONTRATADA poderá negativar a CONTRATANTE, assim como fazer as cobranças pelos meios judiciais cabíveis.`,'',
    '## CLÁUSULA SEXTA: RESCISÃO DE CONTRATO',
    `1º - O presente contrato tem vigência mínima de ${numeroComExtenso(meses)} ${meses===1?'mês':'meses'}, sendo este período considerado irrevogável e não cancelável sem a aplicação de multa rescisória.`,
    `Caso a CONTRATANTE deseje rescindir o contrato antes do término do prazo de ${meses} ${meses===1?'mês':'meses'}, deverá comunicar formalmente a CONTRATADA com 30 (trinta) dias de antecedência via e-mail (${CONTRATADA.emailFinanceiro}), ficando sujeita ao pagamento de uma multa rescisória da seguinte forma:`,
    ...s(d.multa??multaPadrao(meses)).split('\n').filter(Boolean).map(l=>'> '+l),
    'A multa tem por finalidade compensar os investimentos de tempo, estrutura e equipe já alocados ao projeto e não possui natureza punitiva, mas indenizatória.',
    'Obs: A última fatura referente aos trabalhos acontece após o cumprimento do aviso prévio, pois é referente os trabalhos executados durante o período.',
    '2º - A CONTRATADA poderá rescindir o contrato sem aviso prévio, não possuindo multa.','',
    '## CLÁUSULA SÉTIMA: DA PROTEÇÃO DE DADOS PESSOAIS',
    '1º - A CONTRATANTE fornecerá à CONTRATADA seu cadastro de clientes com os dados pessoais básicos e estritamente necessários para o cumprimento do objeto do presente instrumento, obrigando-se a CONTRATADA, na posição de Operadora, a usar e tratar os dados pessoais a que tiver acesso, exclusivamente, para as finalidades que visem o cumprimento e execução do objeto contratual, sendo vedada sua utilização para qualquer outra finalidade ou seu compartilhamento com outras empresas e pessoas.',
    '2º - A CONTRATADA deverá adotar todas as medidas técnicas de segurança necessárias para proteger os dados pessoais de acessos não autorizados e de situações acidentais ou ilícitas de destruição, perda, alteração, comunicação ou qualquer forma de tratamento inadequado ou ilícito, observada a natureza dos dados tratados, visando a segurança e a confidencialidade dos dados pessoais tratados.',
    '3º - A CONTRATANTE deverá enviar à CONTRATADA a sua base de dados de clientes para que a CONTRATADA execute os trabalhos de marketing. A CONTRATANTE é totalmente responsável pela legitimidade destes dados, e deverá enviar apenas cadastros de clientes dos quais tiveram relacionamento com a empresa e possuem conhecimento do mesmo, sendo assim, a CONTRATADA não se responsabilizará por envios de materiais publicitários para cadastros que não tiveram relacionamento com a CONTRATANTE.',
    '4º - As Partes, por si, por seus representantes legais e colaboradores declaram estar adequados às disposições da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados - LGPD), garantindo que os dados pessoais a que tiverem acesso durante a relação contratual sejam tratados dentro das bases legais que autorizam sua utilização, sendo que cada Parte (Controlador e Operadora) é responsável pelo cumprimento de suas obrigações decorrentes da LGPD e posteriores regulamentações emitidas pela autoridade reguladora competente, obrigando-se a adotar todas as medidas de segurança necessárias para cuidar e proteger os dados pessoais de acessos não autorizados ou qualquer outra forma de tratamento inadequado ou ilícito.',
    '5º - Encerrada a vigência do contrato e/ou não havendo mais necessidade de utilização dos dados pessoais fornecidos, a CONTRATADA deverá interromper o uso e tratamento do cadastro de clientes da CONTRATANTE, eliminando de sua base todos os dados pessoais disponibilizados, salvo os dados que a CONTRATADA seja obrigada a manter por obrigação legal ou regulatória.','',
    '## CLÁUSULA OITAVA: DIREITO DE IMAGEM',
    '1º - A CONTRATANTE autoriza o uso de sua imagem e dos serviços de imagem prestados, em todo e qualquer material entre fotos, materiais publicitários, documentos e outros meios de comunicação, para campanhas promocionais e institucionais da CONTRATADA, durante o contrato de trabalho e após o encerramento do contrato.',
    '2º - A presente autorização é concedida a título gratuito, abrangendo o uso da imagem acima mencionada em todo território nacional e no exterior, sob qualquer forma e meios, ou sejam, em destaque: (I) out-door; (II) bus-door; folhetos em geral (encartes, mala direta, catálogo, etc.); (III) folder de apresentação; (IV) anúncios em revistas e jornais em geral; (V) home page; (VI) cartazes; (VII) back-light; (VIII) fotos; (IX) vídeos; (X) portfólios; (XI) sites; (XII) mídia eletrônica (painéis, vídeo-tapes, televisão, cinema, programa para rádio, entre outros).','',
    '## CLÁUSULA NONA: DISPOSIÇÕES GERAIS',
    '- Ficam assegurados à CONTRATADA todos os direitos autorais relativos ao projeto, sem que à CONTRATANTE caiba qualquer direito neste sentido, mesmo em caso de rescisão do presente instrumento, e com a total liberação da CONTRATADA publicar em seus meios de divulgação, tais como Mídias Sociais, sites, Portfólio, entre outros;',
    '- A CONTRATADA poderá transferir ou delegar as atribuições e responsabilidades que assume por força deste contrato a terceiros sob sua responsabilidade;',
    '- Os signatários do presente contrato asseguram e afirmam que são os representantes legais competentes para assumir em nome das partes as obrigações descritas neste contrato e representar de forma efetiva seus interesses.',
    '- As partes são contratantes totalmente independentes, sendo cada uma inteiramente responsável por seus atos, obrigações e conteúdo das informações prestadas, sem qualquer vínculo empregatício.',
    '- Fica eleito o foro da Cidade de Criciúma/SC, para decidir qualquer litígio decorrente do presente instrumento.','',
    'Assim, justo e acordado o presente instrumento contratual, CONTRATANTE e CONTRATADA assinam o presente de forma digital, sendo mantido todo o teor legal aos direitos das partes.','',
    localData(d),'',...assinaturas(d));
  return L;
}

// Cláusulas 6/7 em diante comuns a Site e E-commerce (confidencialidade, LGPD, imagem, rescisão, gerais, foro).
function finaisProjeto(n:number,d:Dados){
  return [
    `## ${n} – CONFIDENCIALIDADE`,
    `${n}.1 - A CONTRATADA não será responsável por violações dos dados e informações resultantes de atos de funcionários, prepostos ou de pessoas autorizadas pela CONTRATANTE e nem daquelas resultantes da ação criminosa ou irregular de terceiros (“hackers”) fora dos limites da previsibilidade técnica do momento em que a mesma vier a ocorrer.`,
    `${n}.2 - As partes acordam que as informações constantes do “site” criado e dos bancos de dados utilizados pela CONTRATANTE estão cobertas pela cláusula de sigilo e confidencialidade.`,'',
    `## ${n+1} – PROTEÇÃO DOS DADOS`,
    `${n+1}.1 - As Partes declaram que irão tratar dados pessoais em conformidade com a Lei 13.709/18 (LGPD) e outras leis aplicáveis às atividades das Partes relacionadas à proteção de dados e privacidade e garantir que seus empregados, agentes e subcontratados também o façam.`,
    `${n+1}.2 - As Partes garantem que todos os dados pessoais eventualmente compartilhados no âmbito deste Contrato foram obtidos legalmente de acordo com os requisitos da LGPD e que possuem o direito de tratá-los e de compartilhá-los com a outra Parte.`,'',
    `## ${n+2} – DIREITO DE IMAGEM`,
    `${n+2}.1 - A CONTRATANTE autoriza o uso de sua imagem e dos serviços de imagem prestados, em todo e qualquer material entre fotos, materiais publicitários, documentos e outros meios de comunicação, para campanhas promocionais e institucionais da CONTRATADA, durante o contrato de trabalho e após o encerramento do contrato.`,
    `${n+2}.2 - A presente autorização é concedida a título gratuito, abrangendo o uso da imagem acima mencionada em todo território nacional e no exterior, sob qualquer forma e meios, ou sejam, em destaque: (I) out-door; (II) bus-door; folhetos em geral (encartes, mala direta, catálogo, etc.); (III) folder de apresentação; (IV) anúncios em revistas e jornais em geral; (V) home page; (VI) cartazes; (VII) back-light; (VIII) fotos; (IX) vídeos; (X) portfólios; (XI) sites; (XII) mídia eletrônica (painéis, vídeo-tapes, televisão, cinema, programa para rádio, entre outros).`,'',
    `## ${n+3} – RESCISÃO, DESISTÊNCIA OU CANCELAMENTO`,
    `${n+3}.1 - Caso a CONTRATANTE venha a rescindir, desistir ou cancelar o serviço contratado objeto do presente instrumento após o início da prestação do serviço e do seu desenvolvimento, a CONTRATANTE terá que pagar à CONTRATADA multa de ${numeroComExtenso(Number(d.multa_percentual)||80).replace(/^(\d+) /,'$1% ')} do valor total do contrato.`.replace(/(\d+)% \((.*?)\)/,'$1% ($2 por cento)'),'',
    `## ${n+4} - DAS CONDIÇÕES GERAIS`,
    `${n+4}.1 - O presente instrumento não dará azo à constituição de qualquer vínculo empregatício ou responsabilidade entre as partes.`,
    `${n+4}.2 - A CONTRATANTE arcará com o pagamento de todos os encargos fiscais e tributários decorrentes do ora contratado.`,
    `${n+4}.3 - Eventuais alterações ou casos omissos serão acordados entre as partes na forma de aditivos a este Contrato.`,'',
    `## ${n+5} – FORO`,
    `${n+5}.1 - Para dirimir quaisquer controvérsias decorrentes do presente contrato, as partes elegem o Foro da Comarca de Criciúma/SC.`,'',
    'E, por estarem de acordo com as condições acima, contratante e contratada assinam o presente contrato em duas vias de igual teor, na presença de duas testemunhas.','',
    localData(d),'',...assinaturas(d),
  ];
}
const pagamentoParcelado=(total:number,parcelas:number,forma:string)=>parcelas>1
  ?`${valorComExtenso(total)} em ${numeroComExtenso(parcelas)} parcelas iguais e consecutivas no valor de ${valorComExtenso(total/parcelas)}, via ${forma||'cartão de crédito'}`
  :`${valorComExtenso(total)}, via ${forma||'boleto'}`;

// ---------- CRIAÇÃO DE WEBSITE ----------
function site(d:Dados):string[]{
  const paginas=Number(d.paginas)||5,prazo=Number(d.prazo_dias)||45,total=parseValor(d.valor_total),parcelas=Number(d.parcelas)||1;
  const host=parseValor(d.hospedagem_valor);
  const listaPaginas=s(d.lista_paginas||'Home\nQuem Somos\nTrabalhe conosco\nServiços\nContatos').split('\n').filter(Boolean);
  return [
    '#T CONTRATO DE PRESTAÇÃO DE SERVIÇOS - CRIAÇÃO DE WEBSITE','',
    'Este contrato visa documentar a proposta de prestação de serviços apresentada pela CONTRATADA e aceita previamente pela CONTRATANTE, contendo todas as informações acerca da metodologia de trabalho, recursos necessários para a execução do serviço, bem como as descrições das condições de pagamento e prazos previamente definidos.','',
    qualificacao(d),'',contratadaLinha,'',
    '## 1- OBJETO DO CONTRATO',
    '1.1 - A CONTRATADA prestará serviços de criação de website para a CONTRATANTE, desenvolvendo uma plataforma online personalizada de acordo com as necessidades da CONTRATANTE, nos termos especificados abaixo:',
    '1.2 - O website conterá as seguintes funcionalidades e características:',
    `- Site com até ${paginas} páginas`,...listaPaginas.map(p=>'> – '+p),
    `- Até ${Number(d.banners)||3} Banners no topo`,'- Site responsivo','- Formulário de cadastro','- Links de acesso aos portais da empresa',`- Desenvolvimento por ${s(d.plataforma)||'Wordpress'}`,
    ...(s(d.itens_extras)?s(d.itens_extras).split('\n').filter(Boolean).map(l=>'- '+l):[]),
    `1.3 - O prazo previsto para desenvolvimento será de até ${numeroComExtenso(prazo)} dias${d.prazo_uteis?' úteis':''} a contar da assinatura deste contrato, podendo ser prorrogado por igual período.`,'',
    '## 2 - VALOR E FORMA DE PAGAMENTO',
    `2.1 - Pelos serviços prestados, a CONTRATANTE pagará à CONTRATADA o valor total de ${parcelas>1?`${valorComExtenso(total)} parcelado em ${parcelas} vezes sem juros${s(d.forma_pagamento)?' no '+s(d.forma_pagamento):' no cartão de crédito'}`:pagamentoParcelado(total,1,s(d.forma_pagamento))}.`,
    ...(s(d.condicao_pagamento)?['> '+s(d.condicao_pagamento)]:[]),
    '2.2 - Em caso de atraso no pagamento será cobrado multa de 2% e mora diária de 0,33%.',
    '2.3 - Caso não haja o pagamento dos serviços contratados, a CONTRATADA poderá negativar nos cadastros de inadimplentes a CONTRATANTE, assim como fazer as cobranças pelos meios administrativos e judiciais cabíveis.',
    '2.4 – O pagamento pelos serviços acordados previamente não está condicionado à entrega finalizada do website, uma vez que depende do cumprimento das responsabilidades pela CONTRATANTE, incluindo o fornecimento de informações, aprovação do layout, entre outros.',
    '2.5 – Alterações no website após sua entrega poderão ser realizadas e serão cobradas pelo serviço prestado, de acordo com a tabela de preços atualizada da CONTRATADA.','',
    '## 3 - OBRIGAÇÕES DA CONTRATANTE',
    '3.1 - A CONTRATANTE deverá fornecer à CONTRATADA um briefing completo e detalhado sobre o serviço, incluindo referências visuais e inspirações sobre padrões de design, cores, estilos, entre outros, a fim de demonstrar o que gosta e o que espera para o seu website.',
    '3.2 - A CONTRATANTE deverá fornecer à CONTRATADA todas as informações necessárias para a criação do website, incluindo conteúdo, textos, imagens, logotipo e demais materiais relacionados.',
    '3.3 - Referidas informações incluídas nas cláusulas 3.1 e 3.2 deverão ser fornecidas no prazo máximo de 7 (sete) dias, após a assinatura do presente contrato.','',
    '## 4 – REGISTRO DE DOMÍNIO E HOSPEDAGEM',
    '4.1 - A CONTRATANTE será responsável pelo pagamento do registro do domínio para seu website junto ao registro.br, podendo selecionar o de sua preferência.',
    '4.2 - A CONTRATANTE em caso de já possuir registro do domínio deverá fornecer os acessos para que seja possível o direcionamento da hospedagem.',
    '4.3 - A CONTRATANTE deverá selecionar um PLANO DE HOSPEDAGEM junto à CONTRATADA, sendo a CONTRATANTE responsável pelo pagamento mensal ou anual, onde não havendo o pagamento do serviço de hospedagem do website o mesmo ficará fora do ar, não sendo possível transferência de arquivos para outra hospedagem sem a quitação dos valores devidos.',
    '4.4 - A CONTRATANTE em caso de haver uma hospedagem já contratada deverá fornecer todos os acessos para que seja possível a instalação do website.','',
    '## 5 – PLANO DE HOSPEDAGEM',
    '5.1 - A CONTRATANTE adere ao seguinte PLANO DE HOSPEDAGEM junto à CONTRATADA:',
    `- ${s(d.hospedagem_plano)||'HOSPEDAGEM PRÓ'}`,'- 20 GB de SSD NVMe','- 02 vCPU por conta','- Isolamento de Conta','- Tráfego Ilimitado','- 10 E-mails','- 03 GB de RAM','- Certif. SSL','- SSH Pré-ativado',
    `- PLANO: ${host>0?`Valor com pagamento mensal de ${valorComExtenso(host)}${s(d.hospedagem_forma)?', via '+s(d.hospedagem_forma):''}.`:s(d.hospedagem_condicao)||'Sem cobrança de hospedagem.'}`,
    ...(s(d.hospedagem_bonus)?['- BÔNUS: '+s(d.hospedagem_bonus)]:[]),
    `5.2 - A CONTRATANTE pagará o valor de hospedagem em ${s(d.hospedagem_forma)||'boleto'} mensal com o primeiro vencimento em ${dataBr(s(d.hospedagem_vencimento))||'__/__/____'}.`,
    `5.3 – O contrato de hospedagem tem início na data de assinatura deste contrato com término em ${dataBr(s(d.hospedagem_termino))||'__/__/____'}.`,
    '5.4 – A renovação do contrato de hospedagem acontecerá automaticamente com acréscimo de 10% (dez por cento) sobre o valor do plano em vigência.',
    '5.5 – A CONTRATADA prestará suporte de hospedagem em horário comercial, de segunda-feira a sexta-feira, das 8h às 12:00h e das 13h às 17h, exceto feriados.','',
    '## 6 – APROVAÇÃO DO LAYOUT E AJUSTES',
    '6.1 - A CONTRATADA desenvolverá um layout para aprovação com base no briefing respondido pela CONTRATANTE, todos os ajustes, sejam de design ou textos deverão ser feitos nesta fase.',
    '6.2 - A CONTRATANTE poderá solicitar apenas 2 (dois) ajustes no layout total do site. Em caso de aprovação na estrutura do site apresentado no layout, a CONTRATANTE poderá solicitar os ajustes de informações, banners e sessões, itens dos quais não influenciam na modificação do layout, totalizando o máximo de 2 (duas) apresentações com os ajustes solicitados. Em caso de ultrapassar os 2 (dois) ajustes seja total ou dos itens dentro do layout, a CONTRATADA poderá negociar valor adicional ao serviço, conforme tabela de preços atualizada.',
    '6.3 - A CONTRATADA iniciará o desenvolvimento do website somente após a aprovação do layout conforme itens acima, não sendo possível ajustes posterior ao desenvolvimento.',
    '6.4 – Poderá a CONTRATANTE solicitar atualizações posteriores a qualquer momento mediante orçamento do serviço solicitado.',
    '6.5 - A responsabilidade da CONTRATADA restringir-se-á aos aplicativos "Website", não respondendo por problemas relacionados ao ambiente, como redes, sistemas operacionais, hardware, servidores, link de internet, hospedagem de terceiros e sistema de backup.',
    '6.6 - A CONTRATADA não se responsabiliza por eventuais erros de indexação, ou seja, erros ou não exibição do domínio do site desenvolvido nos buscadores como Google e demais motores de busca.',
    '6.7 - A CONTRATADA não se responsabiliza por danos decorrentes do mau uso do Website, alimentação errônea e/ou falta de conferência de dados gerados, segurança de senhas, bem como a inexistência de cópias de segurança dos dados atualizados.','',
    ...finaisProjeto(7,d),
  ];
}

// ---------- E-COMMERCE (TRAY) + SUPORTE TÉCNICO ----------
function ecommerce(d:Dados):string[]{
  const prazo=Number(d.prazo_dias)||60,total=parseValor(d.valor_total),parcelas=Number(d.parcelas)||1;
  const suporte=parseValor(d.suporte_valor)||149,meses=Number(d.suporte_meses)||12;
  return [
    '#T CONTRATO DE PRESTAÇÃO DE SERVIÇOS','#S E-Commerce (TRAY) + Suporte Técnico','',
    'Este contrato visa documentar a proposta de prestação de serviços apresentada pela CONTRATADA e aceita previamente pela CONTRATANTE, contendo todas as informações acerca da metodologia de trabalho, recursos necessários para a execução do serviço, bem como as descrições das condições de pagamento e prazos previamente definidos.','',
    qualificacao(d),'',contratadaLinha,'',
    '## 1- OBJETO DO CONTRATO',
    '1.1 - A CONTRATADA prestará serviços de criação de e-commerce para a CONTRATANTE, desenvolvendo a partir da plataforma TRAY, personalizada de acordo com as necessidades da CONTRATANTE, nos termos especificados abaixo:',
    '1.2 - O website conterá as seguintes funcionalidades e características:',
    '- Desenvolvimento da loja a partir do plano contratado pela Contratante junto a Tray.','- Personalização da loja através dos layouts da plataforma Tray','- Segmentação por produtos','- Banners para as páginas','- Treinamento para cadastro dos produtos e operar com a loja',`- Suporte de ${meses} meses.`,
    `1.3 - O prazo previsto para desenvolvimento será de ${numeroComExtenso(prazo)} dias úteis a contar da assinatura deste contrato, podendo ser prorrogado por igual período.`,'',
    '## 2 - VALOR E FORMA DE PAGAMENTO',
    '2.1 - Pelos serviços prestados, a CONTRATANTE pagará à CONTRATADA os seguintes valores:',
    `> ${pagamentoParcelado(total,parcelas,s(d.forma_pagamento))}, referente a desenvolvimento de loja virtual.`,
    `> ${pagamentoParcelado(suporte*meses,Number(d.suporte_parcelas)||meses,s(d.suporte_forma)||s(d.forma_pagamento))}, referente a suporte técnico.`,
    ...(s(d.condicao_pagamento)?['> '+s(d.condicao_pagamento)]:[]),
    '2.2 - Em caso de atraso no pagamento será cobrado multa de 2% e mora diária de 0,33%.',
    '2.3 - Caso não haja o pagamento dos serviços contratados, a CONTRATADA poderá negativar nos cadastros de inadimplentes a CONTRATANTE, assim como fazer as cobranças pelos meios administrativos e judiciais cabíveis.',
    '2.4 – O pagamento pelos serviços acordados previamente não está condicionado à entrega finalizada do website, uma vez que depende do cumprimento das responsabilidades pela CONTRATANTE, incluindo o fornecimento de informações, aprovação do layout, entre outros.',
    '2.5 – Alterações no website após sua entrega poderão ser realizadas e serão cobradas pelo serviço prestado, de acordo com a tabela de preços atualizada da CONTRATADA.','',
    '## 3 - OBRIGAÇÕES DA CONTRATANTE',
    '3.1 - A CONTRATANTE deverá fornecer à CONTRATADA um briefing completo e detalhado sobre o serviço, incluindo referências visuais e inspirações sobre padrões de design, cores, estilos, entre outros, a fim de demonstrar o que gosta e o que espera para o seu website.',
    '3.2 - A CONTRATANTE deverá fornecer à CONTRATADA todas as informações necessárias para a criação do e-commerce, incluindo conteúdo, textos, imagens, logotipo e demais materiais relacionados.',
    '3.3 - Referidas informações incluídas nas cláusulas 3.1 e 3.2 deverão ser fornecidas no prazo máximo de 7 (sete) dias, após a assinatura do presente contrato.',
    '3.4 - A CONTRATANTE deverá aderir ao plano de sua escolha dentro da plataforma TRAY, sendo ela responsável pela mensalidade e custos da plataforma.',
    '3.5 - A CONTRATANTE deverá adquirir o tema para o e-commerce disponibilizado pela plataforma TRAY, sendo responsável pelo pagamento.','',
    '## 4 – REGISTRO DE DOMÍNIO, HOSPEDAGEM E SUPORTE',
    '4.1 - A CONTRATANTE será responsável pelo pagamento do registro do domínio para seu website junto ao registro.br, podendo selecionar o de sua preferência.',
    '4.2 - A CONTRATANTE em caso de já possuir registro do domínio deverá fornecer os acessos para que seja possível o direcionamento para a loja.',
    '4.3 - A CONTRATANTE deverá selecionar um PLANO DE SUPORTE junto à CONTRATADA, sendo a CONTRATANTE responsável pelo pagamento mensal ou anual, onde não havendo o pagamento fica encerrado o compromisso do serviço de suporte do website. Tal contrato dá direito apenas a 30 (trinta) dias de suporte, caso não contrate um plano de suporte a CONTRATADA não prestará auxílio na loja.','',
    '## 5 – APROVAÇÃO DO LAYOUT E AJUSTES',
    '5.1 - A CONTRATADA desenvolverá a loja a partir de um layout/tema pré selecionado na plataforma TRAY, conforme item 3.5.',
    '5.2 - A CONTRATANTE poderá solicitar apenas 2 (dois) ajustes no layout total do site. Em caso de aprovação na estrutura do site apresentado no layout, a CONTRATANTE poderá solicitar os ajustes de informações, banners e sessões, itens dos quais não influenciam na modificação do layout, totalizando o máximo de 2 (duas) apresentações com os ajustes solicitados. Em caso de ultrapassar os 2 (dois) ajustes seja total ou dos itens dentro do layout, a CONTRATADA poderá negociar valor adicional ao serviço, conforme tabela de preços atualizada.',
    '5.3 - A CONTRATADA iniciará o desenvolvimento do website somente após a aprovação do layout conforme itens acima, não sendo possível ajustes posterior ao desenvolvimento.',
    '5.4 – Poderá a CONTRATANTE solicitar atualizações posteriores a qualquer momento mediante orçamento do serviço solicitado.',
    '5.5 - A responsabilidade da CONTRATADA restringir-se-á apenas na configuração da loja dentro da plataforma TRAY, não respondendo por problemas relacionados ao ambiente, como redes, sistemas operacionais, hardware, servidores, link de internet, meios de pagamento, fretes, hospedagem de terceiros, sistema de backup, entre outros que são de total responsabilidade da plataforma.',
    '5.6 - A CONTRATADA não se responsabiliza por eventuais erros de indexação, ou seja, erros ou não exibição do domínio do site desenvolvido nos buscadores como Google e demais motores de busca.',
    '5.7 - A CONTRATADA não se responsabiliza por danos decorrentes do mau uso do Website, alimentação errônea e/ou falta de conferência de dados gerados, segurança de senhas, bem como a inexistência de cópias de segurança dos dados atualizados.','',
    '## 6 – PLANO DE SUPORTE',
    '6.1 – Serviços inclusos no plano de suporte adquirido pela Contratante:',
    '- Treinamento para cadastro de produtos','- Auxílio para edição de produtos','- Suporte para possíveis erros da loja, onde a CONTRATADA poderá acionar o suporte da plataforma TRAY para correção','- Criação de até 2 banners mensais',
    `O Valor do plano mensal será de ${valorComExtenso(suporte)}, cuja forma de pagamento está citada no item 2.1.`,
    `6.2 – O contrato de suporte tem início na data de assinatura deste contrato, sendo o pagamento da mensalidade via ${s(d.suporte_forma)||s(d.forma_pagamento)||'cartão de crédito'}.`,
    '6.3 – A renovação do contrato de suporte acontecerá automaticamente com acréscimo de 10% (dez por cento) sobre o valor do plano em vigência.',
    '6.4 – A CONTRATADA prestará suporte de hospedagem em horário comercial, de segunda-feira a sexta-feira, das 8h às 12:00h e das 13h às 17h, exceto feriados.','',
    ...finaisProjeto(7,d),
  ];
}

export const MODELOS:Record<Modelo,{nome:string;montar:(d:Dados)=>string[]}>={
  gestao:{nome:'Gestão de Marketing Digital',montar:gestao},
  site:{nome:'Criação de Website',montar:site},
  ecommerce:{nome:'E-commerce (Tray) + Suporte Técnico',montar:ecommerce},
};

// Qual modelo usar a partir do tipo/modelo escolhido no sistema.
export function modeloDoContrato(kind:string,model:string):Modelo|null{
  if(kind==='Gestão')return 'gestao';
  if(/e-?commerce|loja/i.test(model))return 'ecommerce';
  if(/site|website/i.test(model))return 'site';
  return null;
}

// Valores sugeridos para preencher o formulário.
export function sugestoes(modelo:Modelo,plano:string,modalidade:string,hoje=new Date()){
  const iso=(d:Date)=>d.toISOString().slice(0,10);
  const add=(d:Date,{dias=0,meses=0})=>{const x=new Date(d);x.setMonth(x.getMonth()+meses);x.setDate(x.getDate()+dias);return x;};
  const base:Dados={data_contrato:iso(hoje)};
  if(modelo==='gestao'){
    const p=PLANOS[plano]||PLANOS['ADS PRO'],meses=MODALIDADES[modalidade]||6,[impl,mensal]=p.precos[modalidade]||[0,0];
    const fim=add(add(hoje,{meses}),{dias:-1});
    Object.assign(base,{plano,modalidade,vigencia_meses:meses,inicio:iso(hoje),termino:iso(fim),implantacao_valor:impl,mensal_valor:mensal,
      implantacao_forma:'Boleto',implantacao_vencimento:iso(add(hoje,{dias:5})),mensal_forma:'Boleto',mensal_dia:10,itens_plano:p.itens,multa:multaPadrao(meses),invest_minimo:p.investMin});
  }else if(modelo==='site'){
    Object.assign(base,{paginas:5,prazo_dias:45,valor_total:1990,parcelas:10,forma_pagamento:'cartão de crédito',hospedagem_plano:'HOSPEDAGEM PRÓ',hospedagem_valor:89.9,
      hospedagem_forma:'boleto',hospedagem_vencimento:iso(add(hoje,{meses:1})),hospedagem_termino:iso(add(hoje,{meses:12})),multa_percentual:80});
  }else{
    Object.assign(base,{prazo_dias:60,valor_total:3990,parcelas:10,forma_pagamento:'cartão de crédito',suporte_valor:149,suporte_meses:12,multa_percentual:80});
  }
  return base;
}
export {MES_PT};
