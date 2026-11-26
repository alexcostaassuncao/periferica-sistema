# Periférica — sistema da agência

Mesmo formato do Periflow: **Next.js na Vercel + banco Turso**. As telas ficam em `public/*.html`
(menu e visual em `public/css/app.css` e `public/js/app.js`) e o servidor em `app/api/`.

## O que já funciona de verdade
- **Login** (administrador definido nas variáveis da Vercel).
- **Clientes**: cadastro, edição, squads (arrastar entre C1/C2/C3) e ficha do cliente.
- **Redes sociais** (Configurações → Redes sociais): conecta a Página do Facebook e o Instagram profissional de cada cliente com um único login do Facebook.
- **Publicações**: Post, Carrossel, Reels e Stories no **Instagram e no Facebook**, publicando na hora ou agendado, com lista, calendário, reenvio e cancelamento.

As outras telas estão com **dados de exemplo** do PDF (aparece a etiqueta "Dados de exemplo") e serão ligadas ao banco nas próximas etapas.

## Rodar no computador
```bash
npm install
cp .env.example .env.local   # preencha ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET
npm run dev                  # http://localhost:3000
```
Sem `TURSO_DATABASE_URL`, usa o arquivo local `periferica-local.db`.

Para testar sem login apenas na máquina local, defina `LOCAL_AUTH_BYPASS=1` no `.env.local` e rode `npm run dev -- --hostname 127.0.0.1`. Acesse `http://127.0.0.1:3000/`; o sistema usará um usuário administrador de teste. Esse modo só funciona em desenvolvimento, em loopback, e sem `TURSO_DATABASE_URL`; não o habilite em produção. O servidor estático da porta 5500 não substitui o servidor Next.js nem suas APIs.

## Colocar no ar

### 1. Turso
Crie o banco em turso.tech e copie a **URL** e o **token** para `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`.
As tabelas são criadas sozinhas no build (`scripts/db-migrate.mjs`).

### 2. Vercel
Importe o repositório e preencha as variáveis do `.env.example`:

| Variável | O que é |
|---|---|
| `SITE_URL` | endereço do sistema, ex.: `https://periferica.vercel.app` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | login da direção |
| `SESSION_SECRET` | 32+ caracteres aleatórios |
| `CRON_SECRET` | 16+ caracteres aleatórios (o mesmo vai no GitHub) |
| `CLOUDINARY_*` | onde ficam as imagens e vídeos das publicações |
| `META_APP_ID` / `META_APP_SECRET` | do app da Meta (passo 3) |
| `SOCIAL_TOKEN_KEY` | chave que criptografa os acessos das contas. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

> Não troque a `SOCIAL_TOKEN_KEY` depois de conectar contas: os acessos guardados deixam de abrir e será preciso reconectar.

### 3. App da Meta (Facebook + Instagram)
O Periflow usava o "Login do Instagram", que só publica no Instagram. Aqui usamos o **Login do Facebook**, que libera Facebook **e** Instagram juntos.

1. Em developers.facebook.com → **Criar app** → tipo **Empresa**.
2. Adicione o produto **Login do Facebook para Empresas**.
   Em *URIs de redirecionamento do OAuth válidos*, coloque: `https://SEU-DOMINIO/api/social/meta/callback`
3. Permissões usadas: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`.
4. Enquanto o app estiver em **modo de desenvolvimento**, só quem tem papel no app (administrador/desenvolvedor/testador) consegue conectar. Para conectar as contas dos clientes, envie o app para a **Análise do app** da Meta pedindo essas permissões (a Meta pede um vídeo mostrando o uso: conectar a conta e publicar).
5. Requisitos de cada cliente: Instagram **profissional** (Empresa ou Criador) **ligado a uma Página do Facebook**, e quem conecta precisa ser administrador da Página.
6. A Meta exige uma página de **Política de Privacidade** pública. Coloque o link no app.

### 4. Agendador (GitHub Actions)
Os agendamentos são disparados a cada 5 minutos por `.github/workflows/publicacoes-agendadas.yml`.
Em GitHub → Settings → Secrets and variables → Actions, crie:
- `SITE_URL`: o mesmo da Vercel
- `CRON_SECRET`: o mesmo da Vercel

"Publicar agora" funciona mesmo sem o agendador.

## Como a publicação funciona
- Cada publicação vira um envio por rede (`publication_targets`). Se o Facebook falhar, o Instagram continua.
- **Instagram**: cria a mídia na Meta, espera o processamento (vídeos levam alguns minutos) e publica. Repetir a etapa final nunca duplica o post.
- **Facebook**: Post (foto ou vídeo), Carrossel (várias fotos num post), Reels e Stories.
  Se a Meta não responder na etapa final, o envio fica como **"Confirmar"** e **não é reenviado sozinho**, para não duplicar. Alguém confere na Página e clica em "Já saiu" ou "Reenviar".
- Mídias do Cloudinary são ajustadas automaticamente: feed em 4:5 e Stories/Reels em 9:16.

## Origem dos leads
- A página pública `https://SEU-DOMINIO/formulario.html` cadastra contatos no funil comercial. UTMs e `gclid`/`fbclid` recebidos na primeira visita são preservados em cookie first-party por 90 dias e enviados ao lead; uma visita posterior não substitui a primeira origem.
- No Comercial, **Códigos** permite cadastrar códigos de referência para anúncios que abrem o WhatsApp. Inclua o código na mensagem pré-preenchida (por exemplo, `[Ref: M01]`) e informe-o no cadastro manual do lead. Códigos desconhecidos/inativos são rejeitados sem preencher dados estimados.
- A ficha do lead mostra a origem, os UTMs, a data de conversão e os históricos de alterações da atribuição e de etapas do funil. **Relatórios** agrega leads e clientes por plataforma, campanha, anúncio e canal, com filtro de período.
- O cadastro atual continua disponível e leads registrados manualmente são marcados como tais.

### Atendimento inicial e integração de canais

Na automação do canal, envie o link absoluto de `/formulario.html` na mensagem inicial para oferecer a seleção múltipla. Se o canal tiver uma interface própria de seleção múltipla, use `GET /api/leads/intake` para obter a mensagem inicial (`initial_message`) e as opções agrupadas do catálogo (`catalog`).

Para enviar as escolhas ao CRM, configure `LEAD_INTAKE_SECRET` no servidor e use `POST /api/leads/intake` com `Authorization: Bearer <LEAD_INTAKE_SECRET>` e `Content-Type: application/json`. Exemplo de corpo:

```json
{
  "lead_source": "whatsapp_api",
  "external_id": "oportunidade-123",
  "company": "Empresa Exemplo",
  "phone": "+5511999999999",
  "products": ["Gestão de Marketing", "Criação de Sites"]
}
```

Envie as escolhas juntas após concluir o atendimento inicial. Use um identificador estável e único por oportunidade no canal, inclusive em reenvios. O mesmo par `lead_source` e `external_id` retorna o mesmo lead e preserva as edições do vendedor. Os canais aceitos são `whatsapp_api`, `meta_form` e `integration`. Sem seleção, omita `products` e o vendedor poderá preencher na ficha do lead.

A configuração da mensagem automática e o envio do evento dependem do provedor do canal. O projeto oferece o formulário e o endpoint de entrada. A conexão existente com a Meta é para publicação.

## Próximas redes
YouTube e LinkedIn entram como novos valores de `network` em `social_accounts`, com um adaptador novo em `db/publish.ts`.

## Google Calendar da equipe

1. Ative a Google Calendar API no projeto do Google Cloud e configure um cliente OAuth. Autorize o acesso offline com a conta da equipe usando o escopo `https://www.googleapis.com/auth/calendar.events`. Veja a [documentação de OAuth do Google](https://developers.google.com/identity/protocols/oauth2/web-server#offline).
2. Configure `GOOGLE_CALENDAR_ID` com o ID do calendário compartilhado e adicione `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` e `GOOGLE_CALENDAR_REFRESH_TOKEN` ao ambiente do servidor. A conta autorizada precisa poder editar o calendário.
3. Na Agenda, abra uma reunião salva e clique em **Enviar ao Google Calendar**. Reenviar após editar atualiza o mesmo evento. Para cancelar, use **Remover do Google Calendar** antes de cancelar a reunião na Agenda.

Os envios são feitos sob demanda, no fuso de São Paulo. O evento contém título, horário, local ou link da reunião. A integração não importa eventos externos nem envia convites.
