-- Owner events (signup/upgrade/outage feed) + status check history.
-- Service-role only: RLS on, no policies.

CREATE TABLE IF NOT EXISTS owner_events (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL,
  user_id     uuid,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);
CREATE INDEX IF NOT EXISTS owner_events_created_idx ON owner_events (created_at DESC);
CREATE INDEX IF NOT EXISTS owner_events_pending_idx ON owner_events (id) WHERE notified_at IS NULL;
ALTER TABLE owner_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS status_checks (
  id         bigserial PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  overall    text NOT NULL,
  components jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS status_checks_at_idx ON status_checks (checked_at DESC);
ALTER TABLE status_checks ENABLE ROW LEVEL SECURITY;

-- Every new auth user becomes a 'signup' event. Never blocks signup.
CREATE OR REPLACE FUNCTION public.record_signup_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO public.owner_events (kind, user_id, payload)
    VALUES ('signup', NEW.id, jsonb_build_object(
      'email', NEW.email,
      'provider', COALESCE(NEW.raw_app_meta_data->>'provider', 'email')
    ));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_signup_event ON auth.users;
CREATE TRIGGER on_auth_user_signup_event
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.record_signup_event();
