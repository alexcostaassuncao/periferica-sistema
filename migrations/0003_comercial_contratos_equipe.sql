-- Equipe: áreas que cada usuário pode acessar (lista JSON) e se o acesso está ativo.
ALTER TABLE users ADD COLUMN areas text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN squads text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN active integer NOT NULL DEFAULT 1;
--> statement-breakpoint
-- Clientes: dados de contato vindos do cadastro do lead.
ALTER TABLE clients ADD COLUMN contact_name text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN phone text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN email text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN lead_id text;
--> statement-breakpoint
-- Comercial (CRM). stage: novo | contato | reuniao | proposta | negociacao | fechado
-- situation: andamento | espera | arquivado
CREATE TABLE leads (
  id text PRIMARY KEY NOT NULL,
  company text NOT NULL,
  segment text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  interest text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'novo',
  situation text NOT NULL DEFAULT 'andamento',
  reason text NOT NULL DEFAULT '',
  return_at text NOT NULL DEFAULT '',
  owner_id text,
  client_id text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX leads_stage ON leads(situation, stage);
--> statement-breakpoint
-- Contratos. kind: Gestão | Projetos   status: elab | aguard | assin | canc
CREATE TABLE contracts (
  id text PRIMARY KEY NOT NULL,
  lead_id text,
  client_id text,
  company text NOT NULL,
  segment text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  document text NOT NULL DEFAULT '',
  kind text NOT NULL,
  model text NOT NULL,
  value text NOT NULL DEFAULT '',
  term text NOT NULL DEFAULT '',
  owner_id text,
  status text NOT NULL DEFAULT 'elab',
  sent_at integer,
  signed_at integer,
  cancelled_reason text NOT NULL DEFAULT '',
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX contracts_status ON contracts(status);
--> statement-breakpoint
CREATE UNIQUE INDEX contracts_lead_open ON contracts(lead_id) WHERE lead_id IS NOT NULL AND status <> 'canc';
