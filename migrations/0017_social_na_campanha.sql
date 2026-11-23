-- Plano do cliente: os posts de social media podem ser usados (impulsionados) nas campanhas de tráfego.
ALTER TABLE clients ADD COLUMN social_in_campaign integer NOT NULL DEFAULT 0;
