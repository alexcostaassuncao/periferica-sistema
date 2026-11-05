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

## Próximas redes
YouTube e LinkedIn entram como novos valores de `network` em `social_accounts`, com um adaptador novo em `db/publish.ts`.
