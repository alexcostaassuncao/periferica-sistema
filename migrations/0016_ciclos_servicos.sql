-- Ciclo mensal de cada cliente (competência = mês YYYY-MM). Um por cliente e mês: nunca duplica.
-- status: planejamento (aberto, consultora planejando) | producao (planejamento concluído) | concluido (todas as entregas obrigatórias finalizadas)
CREATE TABLE client_cycles (
  id text PRIMARY KEY NOT NULL,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month text NOT NULL,
  status text NOT NULL DEFAULT 'planejamento',
  strategy text NOT NULL DEFAULT '',
  meeting_id text REFERENCES meetings(id) ON DELETE SET NULL,
  opened_at integer NOT NULL,
  opened_by text NOT NULL DEFAULT '',
  planning_done_at integer,
  planning_done_by text NOT NULL DEFAULT '',
  closed_at integer,
  grade_hash text,
  grade_expires integer,
  UNIQUE (client_id, month)
);
--> statement-breakpoint
CREATE INDEX client_cycles_month ON client_cycles(month, status);
--> statement-breakpoint
-- Campos da entrega no ciclo: data de publicação (separada do prazo de execução), objetivo, roteiro e equipe do vídeo.
-- required=1: entrega obrigatória do plano (conta no % de conclusão). done_at: quando foi finalizada (aprovada).
ALTER TABLE tasks ADD COLUMN publish_date text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN objective text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN script text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN needs_capture integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN capture_id text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN editor_id text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN required integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN done_at integer;
--> statement-breakpoint
CREATE INDEX tasks_plan_month ON tasks(plan_month, stage);
--> statement-breakpoint
-- Tarefas geradas pelo plano são as obrigatórias do mês.
UPDATE tasks SET required=1 WHERE plan_month<>'';
--> statement-breakpoint
UPDATE tasks SET done_at=updated_at WHERE stage='aprovada' AND done_at IS NULL;
--> statement-breakpoint
-- Publicação criada a partir de uma entrega aprovada (fila de Publicações).
ALTER TABLE publications ADD COLUMN task_id text;
--> statement-breakpoint
CREATE INDEX publications_task ON publications(task_id);
--> statement-breakpoint
-- Início e fim da operação do cliente (ciclos só são abertos dentro dessa vigência).
ALTER TABLE clients ADD COLUMN service_start text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE clients ADD COLUMN service_end text NOT NULL DEFAULT '';
--> statement-breakpoint
-- Serviços contratados: cada contrato assinado vira um serviço na esteira da área (Gestão ou Projetos).
-- status: aguardando (na fila da área) | andamento (gerente assumiu) | concluido | cancelado
CREATE TABLE client_services (
  id text PRIMARY KEY NOT NULL,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_id text UNIQUE REFERENCES contracts(id) ON DELETE SET NULL,
  line text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'aguardando',
  manager_id text NOT NULL DEFAULT '',
  responsibles text NOT NULL DEFAULT '[]',
  notes text NOT NULL DEFAULT '',
  started_at integer,
  started_by text NOT NULL DEFAULT '',
  finished_at integer,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX client_services_line ON client_services(line, status);
--> statement-breakpoint
CREATE INDEX client_services_client ON client_services(client_id);
--> statement-breakpoint
-- Contratos já assinados entram como serviços (os de clientes já em Gestão ficam "em andamento").
INSERT INTO client_services (id,client_id,contract_id,line,name,status,started_at,started_by,created_at,updated_at)
  SELECT lower(hex(randomblob(16))),k.client_id,k.id,CASE WHEN k.kind='Projetos' THEN 'projetos' ELSE 'gestao' END,k.model,
    CASE WHEN c.phase IN ('gestao','onboarding') AND k.kind<>'Projetos' THEN 'andamento' ELSE 'aguardando' END,
    CASE WHEN c.phase IN ('gestao','onboarding') AND k.kind<>'Projetos' THEN COALESCE(k.signed_at,k.updated_at) END,
    CASE WHEN c.phase IN ('gestao','onboarding') AND k.kind<>'Projetos' THEN 'Sistema' ELSE '' END,
    COALESCE(k.signed_at,k.updated_at),COALESCE(k.signed_at,k.updated_at)
  FROM contracts k JOIN clients c ON c.id=k.client_id WHERE k.status='assin' AND k.client_id IS NOT NULL;
