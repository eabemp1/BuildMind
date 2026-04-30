# Production Billing Requirements (as of 2026-04-10)

## Required environment variables
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
- PAYSTACK_SECRET_KEY

## Required webhook endpoints
- Paystack webhook URL:
  - https://<your-frontend-domain>/api/billing/paystack/webhook
  - events used: charge.success, subscription.disable, invoice.payment_failed

## Required checks before go-live
1. Confirm /api/waitlist writes to Supabase (not only localStorage fallback).
2. Complete a real Paystack test payment and confirm /api/billing/paystack/verify returns ok.
3. Confirm user metadata is updated with:
   - plan=builder
   - billing_provider
   - billing_status
   - billing_updated_at
4. Trigger webhook test and confirm downgrades/cancellations sync to plan=free.
5. Confirm production uses the Paystack checkout and webhook endpoints only.

## Notes
- The frontend no longer grants Builder by localStorage only; server verification is required.
- Keep SUPABASE_SERVICE_ROLE_KEY server-side only.
