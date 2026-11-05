-- Links de redefinição de senha. Guarda só o hash do código enviado por email.
CREATE TABLE password_resets (
  token_hash text PRIMARY KEY NOT NULL,
  user_id text NOT NULL,
  expires_at integer NOT NULL,
  used_at integer
);
--> statement-breakpoint
CREATE INDEX password_resets_user ON password_resets(user_id);
