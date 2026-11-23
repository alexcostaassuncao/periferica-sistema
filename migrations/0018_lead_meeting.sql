ALTER TABLE leads ADD COLUMN meeting_id text REFERENCES meetings(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX leads_meeting_id ON leads(meeting_id) WHERE meeting_id IS NOT NULL;
