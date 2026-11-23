ALTER TABLE leads ADD COLUMN loss_reason text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE lead_stage_history ADD COLUMN reason text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE leads SET stage='proposta' WHERE stage='negociacao';
--> statement-breakpoint
UPDATE leads SET stage=CASE
  WHEN EXISTS (SELECT 1 FROM contracts c WHERE c.lead_id=leads.id AND c.status='assin') THEN 'fechado'
  WHEN EXISTS (SELECT 1 FROM contracts c WHERE c.lead_id=leads.id AND c.status IN ('elab','aguard')) THEN 'aguardando_contrato'
  ELSE 'proposta'
END
WHERE stage='fechado' AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.lead_id=leads.id AND c.status='assin');
