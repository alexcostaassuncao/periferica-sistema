-- Contrato gerado a partir do modelo: dados do formulário (JSON) e link de envio para o cliente.
ALTER TABLE contracts ADD COLUMN data text NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE contracts ADD COLUMN share_hash text;
--> statement-breakpoint
ALTER TABLE contracts ADD COLUMN share_expires integer;
--> statement-breakpoint
ALTER TABLE contracts ADD COLUMN emailed_to text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE contracts ADD COLUMN emailed_at integer;
