-- Fase do cliente na operação (separada da situação ativo/inativo/pausado):
-- '' = ainda não começou · onboarding · gestao
ALTER TABLE clients ADD COLUMN phase text NOT NULL DEFAULT '';
--> statement-breakpoint
-- Equipe interna responsável pelo cliente. role: consultora | copy | design | trafego | comercial
CREATE TABLE client_team (
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role text NOT NULL,
  user_id text NOT NULL,
  PRIMARY KEY (client_id, role)
);
--> statement-breakpoint
-- Histórico: contatos, reuniões, anotações e eventos automáticos do sistema.
-- kind: contato | reuniao | nota | sistema
CREATE TABLE client_events (
  id text PRIMARY KEY NOT NULL,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'nota',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  happened_at text NOT NULL,
  author_id text NOT NULL DEFAULT '',
  author_name text NOT NULL DEFAULT '',
  created_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX client_events_client ON client_events(client_id, happened_at);
--> statement-breakpoint
-- Documentos do cliente (links: Drive, contrato assinado, briefing…).
CREATE TABLE client_documents (
  id text PRIMARY KEY NOT NULL,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  created_by text NOT NULL DEFAULT '',
  created_at integer NOT NULL
);
--> statement-breakpoint
-- Cofre de senhas: a senha fica criptografada; só quem tem a área "cofre" vê.
CREATE TABLE client_vault (
  id text PRIMARY KEY NOT NULL,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform text NOT NULL,
  login text NOT NULL DEFAULT '',
  secret_cipher text NOT NULL DEFAULT '',
  access_type text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'liberado',
  updated_by text NOT NULL DEFAULT '',
  updated_at integer NOT NULL
);
--> statement-breakpoint
-- Onboarding: um por cliente (o UNIQUE impede iniciar duas vezes).
-- status: andamento | concluido
CREATE TABLE onboardings (
  id text PRIMARY KEY NOT NULL,
  client_id text NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'andamento',
  started_at integer NOT NULL,
  started_by text NOT NULL DEFAULT '',
  due_at integer NOT NULL,
  finished_at integer
);
--> statement-breakpoint
CREATE TABLE onboarding_items (
  id text PRIMARY KEY NOT NULL,
  onboarding_id text NOT NULL REFERENCES onboardings(id) ON DELETE CASCADE,
  step integer NOT NULL,
  position integer NOT NULL,
  label text NOT NULL,
  role text NOT NULL DEFAULT '',
  done integer NOT NULL DEFAULT 0,
  done_by text NOT NULL DEFAULT '',
  done_at integer,
  notes text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX onboarding_items_ob ON onboarding_items(onboarding_id, step, position);
