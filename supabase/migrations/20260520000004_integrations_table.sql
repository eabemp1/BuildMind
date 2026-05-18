-- integrations — Notion + Linear OAuth token storage (Audit v8 PROD #8)
--
-- Stores third-party integration credentials for pulling real task context
-- into the Reflexion pipeline. One row per user per provider.

CREATE TABLE IF NOT EXISTS integrations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider     text NOT NULL CHECK (provider IN ('notion', 'linear')),
  access_token text NOT NULL,
  workspace_id text,
  database_id  text,     -- Notion DB ID or Linear team ID
  metadata     jsonb,    -- e.g. workspace name, user email
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations_select_own" ON integrations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "integrations_insert_own" ON integrations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "integrations_update_own" ON integrations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "integrations_delete_own" ON integrations FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS integrations_user_provider_idx ON integrations (user_id, provider);

CREATE OR REPLACE FUNCTION update_integrations_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_integrations_updated_at();
