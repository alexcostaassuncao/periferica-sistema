ALTER TABLE tasks ADD COLUMN plan_month text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE INDEX tasks_plan ON tasks(client_id, plan_month, category);
