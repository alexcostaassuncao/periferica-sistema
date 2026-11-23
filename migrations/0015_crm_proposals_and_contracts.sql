ALTER TABLE leads ADD COLUMN proposal_sent_at integer;
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN accepted_at integer;
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN signed_at integer;
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN lost_at integer;
--> statement-breakpoint
ALTER TABLE contracts ADD COLUMN amount_cents integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE contracts ADD COLUMN required integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE contracts ADD COLUMN form_hash text;
--> statement-breakpoint
ALTER TABLE contracts ADD COLUMN form_expires integer;
--> statement-breakpoint
CREATE TABLE lead_products (
  id text PRIMARY KEY NOT NULL,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'outro',
  name text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX lead_products_lead ON lead_products(lead_id, position, created_at);
--> statement-breakpoint
CREATE TABLE lead_product_history (
  id text PRIMARY KEY NOT NULL,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  changed_by text NOT NULL DEFAULT '',
  changed_by_name text NOT NULL DEFAULT '',
  old_data text NOT NULL DEFAULT '[]',
  new_data text NOT NULL DEFAULT '[]',
  created_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX lead_product_history_lead ON lead_product_history(lead_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE contract_history (
  id text PRIMARY KEY NOT NULL,
  contract_id text NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  lead_id text REFERENCES leads(id) ON DELETE CASCADE,
  from_status text NOT NULL DEFAULT '',
  to_status text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  changed_by text NOT NULL DEFAULT '',
  changed_by_name text NOT NULL DEFAULT '',
  created_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX contract_history_lead ON contract_history(lead_id, created_at DESC);
--> statement-breakpoint
DROP INDEX contracts_lead_open;
--> statement-breakpoint
CREATE UNIQUE INDEX contracts_lead_kind_open ON contracts(lead_id,kind) WHERE lead_id IS NOT NULL AND status<>'canc';
--> statement-breakpoint
INSERT INTO lead_products(id,lead_id,category,name,amount_cents,position,created_at,updated_at)
  SELECT lower(hex(randomblob(16))),id,
    CASE WHEN lower(interest) LIKE '%site%' OR lower(interest) LIKE '%e-commerce%' OR lower(interest) LIKE '%ecommerce%' THEN 'projeto'
      WHEN trim(interest)<>'' THEN 'gestao' ELSE 'outro' END,
    trim(interest),0,0,created_at,updated_at
  FROM leads WHERE trim(interest)<>'';
--> statement-breakpoint
UPDATE leads SET proposal_sent_at=COALESCE(
  (SELECT MAX(h.changed_at) FROM lead_stage_history h WHERE h.lead_id=leads.id AND h.to_stage='proposta'),updated_at)
  WHERE stage='proposta';
--> statement-breakpoint
UPDATE leads SET accepted_at=COALESCE(
  (SELECT MAX(h.changed_at) FROM lead_stage_history h WHERE h.lead_id=leads.id AND h.to_stage='aguardando_contrato'),updated_at)
  WHERE stage IN ('aguardando_contrato','fechado');
--> statement-breakpoint
UPDATE leads SET lost_at=COALESCE(
  (SELECT MAX(h.changed_at) FROM lead_stage_history h WHERE h.lead_id=leads.id AND h.to_stage='venda_perdida'),updated_at)
  WHERE stage='venda_perdida';
--> statement-breakpoint
UPDATE leads SET signed_at=(SELECT MAX(c.signed_at) FROM contracts c WHERE c.lead_id=leads.id AND c.status='assin')
  WHERE stage='fechado';
--> statement-breakpoint
INSERT INTO contract_history(id,contract_id,lead_id,from_status,to_status,action,changed_by_name,created_at)
  SELECT lower(hex(randomblob(16))),id,lead_id,'',status,'Migração inicial','Sistema',updated_at FROM contracts;
--> statement-breakpoint
UPDATE contracts SET required=0 WHERE status='canc';
--> statement-breakpoint
INSERT INTO lead_stage_history(id,lead_id,from_stage,to_stage,changed_by_name,changed_at)
  SELECT lower(hex(randomblob(16))),l.id,l.stage,'aguardando_contrato','Sistema',
    COALESCE((SELECT MIN(c.created_at) FROM contracts c WHERE c.lead_id=l.id AND c.required=1 AND c.status<>'assin'),l.updated_at)
  FROM leads l
  WHERE l.stage<>'aguardando_contrato' AND l.stage<>'venda_perdida'
    AND EXISTS (SELECT 1 FROM contracts c WHERE c.lead_id=l.id AND c.required=1 AND c.status<>'assin');
--> statement-breakpoint
UPDATE leads SET stage='aguardando_contrato',
  accepted_at=COALESCE(accepted_at,(SELECT MIN(c.created_at) FROM contracts c WHERE c.lead_id=leads.id AND c.required=1 AND c.status<>'assin')),
  updated_at=COALESCE((SELECT MIN(c.created_at) FROM contracts c WHERE c.lead_id=leads.id AND c.required=1 AND c.status<>'assin'),updated_at)
  WHERE stage<>'aguardando_contrato' AND stage<>'venda_perdida'
    AND EXISTS (SELECT 1 FROM contracts c WHERE c.lead_id=leads.id AND c.required=1 AND c.status<>'assin');
--> statement-breakpoint
INSERT INTO lead_stage_history(id,lead_id,from_stage,to_stage,changed_by_name,changed_at)
  SELECT lower(hex(randomblob(16))),l.id,l.stage,'fechado','Sistema',
    COALESCE((SELECT MAX(c.signed_at) FROM contracts c WHERE c.lead_id=l.id AND c.required=1),l.updated_at)
  FROM leads l
  WHERE l.stage<>'fechado' AND l.stage<>'venda_perdida'
    AND EXISTS (SELECT 1 FROM contracts c WHERE c.lead_id=l.id AND c.required=1)
    AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.lead_id=l.id AND c.required=1 AND c.status<>'assin');
--> statement-breakpoint
UPDATE leads SET stage='fechado',
  signed_at=(SELECT MAX(c.signed_at) FROM contracts c WHERE c.lead_id=leads.id AND c.required=1),
  updated_at=COALESCE((SELECT MAX(c.signed_at) FROM contracts c WHERE c.lead_id=leads.id AND c.required=1),updated_at)
  WHERE stage<>'fechado' AND stage<>'venda_perdida'
    AND EXISTS (SELECT 1 FROM contracts c WHERE c.lead_id=leads.id AND c.required=1)
    AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.lead_id=leads.id AND c.required=1 AND c.status<>'assin');
