ALTER TABLE leads ADD COLUMN utm_source text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN utm_medium text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN utm_campaign text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN utm_content text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN utm_term text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN gclid text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN fbclid text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN lead_source text NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN platform text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN campaign_name text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN ad_name text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN reference_code text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN attribution_method text NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN conversion_at integer;
--> statement-breakpoint
ALTER TABLE leads ADD COLUMN attribution_raw text NOT NULL DEFAULT '{}';
--> statement-breakpoint
CREATE INDEX leads_attribution_campaign ON leads(platform, campaign_name, ad_name);
--> statement-breakpoint
CREATE TABLE lead_reference_codes (
  id text PRIMARY KEY NOT NULL,
  code text NOT NULL,
  platform text NOT NULL DEFAULT '',
  campaign_name text NOT NULL DEFAULT '',
  ad_name text NOT NULL DEFAULT '',
  campaign_id text NOT NULL DEFAULT '',
  ad_id text NOT NULL DEFAULT '',
  form_id text NOT NULL DEFAULT '',
  utm_source text NOT NULL DEFAULT '',
  utm_medium text NOT NULL DEFAULT '',
  utm_campaign text NOT NULL DEFAULT '',
  utm_content text NOT NULL DEFAULT '',
  utm_term text NOT NULL DEFAULT '',
  gclid text NOT NULL DEFAULT '',
  fbclid text NOT NULL DEFAULT '',
  active integer NOT NULL DEFAULT 1,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX lead_reference_codes_code ON lead_reference_codes(lower(code));
--> statement-breakpoint
CREATE TABLE lead_attribution_history (
  id text PRIMARY KEY NOT NULL,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  changed_by text NOT NULL DEFAULT '',
  changed_by_name text NOT NULL DEFAULT '',
  old_data text NOT NULL DEFAULT '{}',
  new_data text NOT NULL DEFAULT '{}',
  created_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX lead_attribution_history_lead ON lead_attribution_history(lead_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE lead_stage_history (
  id text PRIMARY KEY NOT NULL,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage text NOT NULL DEFAULT '',
  to_stage text NOT NULL,
  changed_by text NOT NULL DEFAULT '',
  changed_by_name text NOT NULL DEFAULT '',
  changed_at integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX lead_stage_history_lead ON lead_stage_history(lead_id, changed_at DESC);
--> statement-breakpoint
CREATE TABLE lead_intake_limits (
  ip_hash text PRIMARY KEY NOT NULL,
  window_start integer NOT NULL,
  count integer NOT NULL DEFAULT 0
);
