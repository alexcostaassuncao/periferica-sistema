-- Reuniões (Agenda e Gestão do cliente usam o mesmo registro) e atas.
-- place: sala | estudio | cliente | mesa | online
CREATE TABLE meetings (
  id text PRIMARY KEY NOT NULL,
  client_id text REFERENCES clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  date text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  place text NOT NULL DEFAULT 'online',
  meet_url text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  participants text NOT NULL DEFAULT '[]',
  minutes_text text NOT NULL DEFAULT '',
  minutes_summary text NOT NULL DEFAULT '',
  minutes_updated_by text NOT NULL DEFAULT '',
  minutes_updated_at integer,
  created_by text NOT NULL DEFAULT '',
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX meetings_date ON meetings(date, start_time);
--> statement-breakpoint
CREATE INDEX meetings_client ON meetings(client_id, date);
--> statement-breakpoint
CREATE TABLE meeting_files (
  id text PRIMARY KEY NOT NULL,
  meeting_id text NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  kind text NOT NULL DEFAULT 'arquivo',
  created_by text NOT NULL DEFAULT '',
  created_at integer NOT NULL
);
--> statement-breakpoint
-- Tarefas: o MESMO registro passa por Gestão → Copy → Design → Revisão → Cliente.
-- stage: gestao | copy | design | revisao | cliente | aprovada
-- client_status: '' | aguardando | aprovada | ajustes
CREATE TABLE tasks (
  id text PRIMARY KEY NOT NULL,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  meeting_id text REFERENCES meetings(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  strategy text NOT NULL DEFAULT '',
  responsible_id text NOT NULL DEFAULT '',
  assignee_id text NOT NULL DEFAULT '',
  due_date text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'social',
  format text NOT NULL DEFAULT 'feed',
  channels text NOT NULL DEFAULT 'ambos',
  stage text NOT NULL DEFAULT 'gestao',
  copy_notes text NOT NULL DEFAULT '',
  art_text text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  client_status text NOT NULL DEFAULT '',
  client_message text NOT NULL DEFAULT '',
  client_feedback text NOT NULL DEFAULT '',
  share_hash text,
  share_expires integer,
  created_by text NOT NULL DEFAULT '',
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX tasks_stage ON tasks(stage, due_date);
--> statement-breakpoint
CREATE INDEX tasks_client ON tasks(client_id, stage);
--> statement-breakpoint
-- Referências do briefing (links, imagens e vídeos).
CREATE TABLE task_refs (
  id text PRIMARY KEY NOT NULL,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'link',
  url text NOT NULL,
  label text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at integer NOT NULL
);
--> statement-breakpoint
-- Versões da entrega do Design (nunca são apagadas ao pedir ajuste).
CREATE TABLE task_versions (
  id text PRIMARY KEY NOT NULL,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version integer NOT NULL,
  url text NOT NULL,
  kind text NOT NULL DEFAULT 'image',
  note text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE task_comments (
  id text PRIMARY KEY NOT NULL,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL,
  mentions text NOT NULL DEFAULT '[]',
  created_at integer NOT NULL
);
--> statement-breakpoint
-- Histórico: cada mudança de etapa, quem fez, para quem foi e o motivo das devoluções.
CREATE TABLE task_history (
  id text PRIMARY KEY NOT NULL,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_stage text NOT NULL DEFAULT '',
  to_stage text NOT NULL DEFAULT '',
  to_user text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  by_id text NOT NULL DEFAULT '',
  by_name text NOT NULL DEFAULT '',
  created_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX task_history_task ON task_history(task_id, created_at);
