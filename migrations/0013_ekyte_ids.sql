-- Código do registro no eKyte, para a importação (scripts/import-ekyte.mjs) poder rodar de novo sem duplicar.
ALTER TABLE clients ADD COLUMN ekyte_id text;
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN ekyte_id text;
--> statement-breakpoint
CREATE UNIQUE INDEX clients_ekyte ON clients(ekyte_id) WHERE ekyte_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX tasks_ekyte ON tasks(ekyte_id) WHERE ekyte_id IS NOT NULL;
