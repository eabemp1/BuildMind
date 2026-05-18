-- subscriptions — proper billing table (Audit v8 ENG #1)
--
-- PROBLEM: Billing data was stored in auth.users.user_metadata (JWT). This means:
--   (a) plan reads require an admin auth call or trusting a potentially stale JWT
--   (b) no payment history or subscription lifecycle tracking
--   (c) "all builder users" requires fetching all auth users
--   (d) JWT staleness: user who just paid may see "free" for up to JWT lifetime
--
-- SOLUTION: A dedicated subscriptions table that is the authoritative billing source.
-- The billing server (lib/billing/server.ts) writes here on every Paystack event.
-- Plan checks read from here (single indexed query). JWT metadata is kept in sync
-- as a cache but is never the source of truth for access decisions.
--
-- MIGRATION STRATEGY: This is additive — existing user_metadata billing data is NOT
-- migrated automatically (too risky without a tested backfill script). Instead:
--   1. New payments write to BOTH user_metadata AND this table.
--   2. getEffectivePlan() checks this table first; falls back to user_metadata.
--   3. A one-time backfill script (run manually) will populate rows from user_metadata.
--   4. Once backfill is confirmed, user_metadata billing fields can be deprecated.

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core billing state
  plan                    text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'builder')),
  status                  text NOT NULL DEFAULT 'free'
                            CHECK (status IN ('active', 'canceled', 'processing', 'free', 'grace')),

  -- Provider info
  provider                text CHECK (provider IN ('paystack', 'stripe')),
  provider_subscription_id text,
  provider_customer_id    text,
  provider_reference      text,   -- Paystack reference / Stripe payment_intent

  -- Lifecycle timestamps
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  grace_period_ends_at    timestamptz,  -- set on payment failure; builder access until this date
  canceled_at             timestamptz,
  trial_ends_at           timestamptz,  -- mirrors founder_context.trial_ends_at for join-free reads

  -- Metadata
  customer_email          text,
  amount_minor            int,    -- in minor currency units (pesewas for GHS, cents for USD)
  currency                text DEFAULT 'GHS',

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- One subscription row per user (upsert on user_id)
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions (user_id);

-- Fast plan lookups by plan+status (used by benchmark cron to find all builder users)
CREATE INDEX IF NOT EXISTS subscriptions_plan_status_idx ON subscriptions (plan, status);

-- Grace period expiry sweep
CREATE INDEX IF NOT EXISTS subscriptions_grace_period_idx
  ON subscriptions (grace_period_ends_at)
  WHERE grace_period_ends_at IS NOT NULL;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
CREATE POLICY "subscriptions_select_own" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
-- Only service role (backend) can insert/update — never the client directly
-- (Client uses API routes which use the admin client)

CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscriptions_updated_at();

COMMENT ON TABLE subscriptions IS
  'Authoritative billing source. Written by billing webhook + persistUserPlan(). '
  'getEffectivePlan() reads this first; falls back to user_metadata during transition period.';
