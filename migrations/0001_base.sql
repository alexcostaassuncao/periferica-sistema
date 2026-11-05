-- Estrutura inicial: usuários, clientes, contas de redes sociais e publicações.
CREATE TABLE users (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT '',
  access text NOT NULL DEFAULT 'Colaborador',
  password_hash text,
  created_at text NOT NULL
);
--> statement-breakpoint
CREATE TABLE login_attempts (
  key text PRIMARY KEY NOT NULL,
  failures integer NOT NULL DEFAULT 0,
  reset_at integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE clients (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  segment text NOT NULL DEFAULT '',
  squad text NOT NULL DEFAULT '',
  services text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ativo',
  created_at text NOT NULL
);
--> statement-breakpoint
-- "state" do login da Meta: impede que alguém injete uma conexão no meio do caminho.
CREATE TABLE social_states (
  state text PRIMARY KEY NOT NULL,
  network text NOT NULL,
  client_id text NOT NULL,
  owner text NOT NULL,
  expires_at integer NOT NULL
);
--> statement-breakpoint
-- Uma linha por perfil conectado (Página do Facebook ou conta profissional do Instagram).
-- network: facebook | instagram (futuro: youtube | linkedin)
CREATE TABLE social_accounts (
  id text PRIMARY KEY NOT NULL,
  client_id text REFERENCES clients(id) ON DELETE SET NULL,
  network text NOT NULL,
  external_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  username text NOT NULL DEFAULT '',
  picture text NOT NULL DEFAULT '',
  page_id text,
  token_cipher text NOT NULL,
  expires_at integer,
  connected_by text NOT NULL DEFAULT '',
  connected_at text NOT NULL,
  UNIQUE(network, external_id)
);
--> statement-breakpoint
CREATE INDEX social_accounts_client ON social_accounts(client_id);
--> statement-breakpoint
-- Uma publicação pode ir para várias redes; cada rede vira um "destino" independente.
-- format: post | carousel | reels | stories
-- media: JSON [{url, kind: image|video, width?, height?}]
CREATE TABLE publications (
  id text PRIMARY KEY NOT NULL,
  client_id text NOT NULL REFERENCES clients(id),
  title text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  format text NOT NULL,
  media text NOT NULL,
  due_at integer NOT NULL,
  created_by text NOT NULL DEFAULT '',
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
--> statement-breakpoint
-- status: queued | processing | publishing | published | failed | cancelled
CREATE TABLE publication_targets (
  id text PRIMARY KEY NOT NULL,
  publication_id text NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  network text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  step text,
  container_id text,
  external_id text,
  permalink text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  lease_until integer NOT NULL DEFAULT 0,
  updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX publication_targets_due ON publication_targets(status, lease_until);
--> statement-breakpoint
CREATE INDEX publications_due ON publications(due_at);
--> statement-breakpoint
CREATE TABLE app_state (
  id text PRIMARY KEY NOT NULL,
  payload text NOT NULL
);
