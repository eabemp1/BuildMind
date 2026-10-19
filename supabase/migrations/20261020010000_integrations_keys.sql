-- Allow read-only key integrations (Stripe restricted key, GitHub token).
-- Tokens for these providers are stored encrypted by the application.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integrations_provider_check') THEN
    ALTER TABLE integrations DROP CONSTRAINT integrations_provider_check;
  END IF;
  ALTER TABLE integrations ADD CONSTRAINT integrations_provider_check CHECK (provider IN ('notion', 'linear', 'stripe', 'github'));
END $$;
