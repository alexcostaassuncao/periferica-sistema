-- Modo desenvolvedor: sugestões de melhoria apontadas na própria tela.
-- kind: bug | melhoria | visual | texto | ideia      priority: baixa | media | alta
-- status: nova | analise | andamento | feita | descartada
CREATE TABLE suggestions (
  id text PRIMARY KEY NOT NULL,
  page text NOT NULL,
  page_title text NOT NULL DEFAULT '',
  selector text NOT NULL DEFAULT '',
  element_text text NOT NULL DEFAULT '',
  viewport text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'melhoria',
  priority text NOT NULL DEFAULT 'media',
  body text NOT NULL,
  images text NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'nova',
  author_id text NOT NULL,
  author_name text NOT NULL DEFAULT '',
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX suggestions_page ON suggestions(page, status);
--> statement-breakpoint
CREATE TABLE suggestion_comments (
  id text PRIMARY KEY NOT NULL,
  suggestion_id text NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX suggestion_comments_s ON suggestion_comments(suggestion_id);
