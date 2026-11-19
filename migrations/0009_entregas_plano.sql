-- Entregas do plano de cada cliente (o que o plano inclui), com quantidade e frequência.
-- category: social | campanha | video_organico | video_campanha     freq: mes | semana
CREATE TABLE client_deliverables (
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category text NOT NULL,
  qty integer NOT NULL DEFAULT 0,
  freq text NOT NULL DEFAULT 'mes',
  updated_by text NOT NULL DEFAULT '',
  updated_at integer NOT NULL,
  PRIMARY KEY (client_id, category)
);
--> statement-breakpoint
-- Calendário de produção: quantas semanas de produção cada mês tem (vale para a agência toda).
CREATE TABLE production_weeks (
  month text PRIMARY KEY NOT NULL,
  weeks integer NOT NULL,
  updated_by text NOT NULL DEFAULT '',
  updated_at integer NOT NULL
);
