# Supabase Schema Fix Guide

## Error Analysis

**Error:** `ERROR: 42P01: relation "founder_context" does not exist`

**Why this happens:**
- Your schema creation SQL ran partially then failed
- Some tables were created but not all
- When Edge Functions try to query `founder_context`, it doesn't exist yet
- The failed transaction left your database in an incomplete state

## Solutions (Choose One)

### Option 1: Use schema-minimal.sql (RECOMMENDED - Fastest)

**File:** `supabase/schema-minimal.sql`

**Steps:**
1. Open [Supabase Dashboard](https://app.supabase.com)
2. Navigate to your project: `dkzucweuzvutxmilpxbd`
3. Go to **SQL Editor** → Click **+ New Query**
4. Copy all content from `supabase/schema-minimal.sql`
5. Paste it into the query editor
6. Click **Run**

**What it does:**
- Drops all existing tables (fresh start)
- Creates the `update_updated_at_column()` trigger function
- Creates all 17 tables with correct structure
- Sets up RLS (Row Level Security) policies
- Verifies success with a final query

**Expected output:**
```
Schema creation COMPLETE ✓
tables_created: 17
```

---

### Option 2: Run diagnostics first (If Option 1 doesn't work)

**File:** `supabase/schema-diagnostic.sql`

**Steps:**
1. Open **SQL Editor** in Supabase
2. Copy content from `supabase/schema-diagnostic.sql`
3. Run it
4. Share the results with me

**What it shows:**
- Which tables currently exist
- Which RLS policies are active
- Which triggers are installed
- Whether extensions are enabled

This helps identify exactly where your schema is incomplete.

---

### Option 3: Debug step-by-step (If something still fails)

**File:** `supabase/schema-chunked.sql`

**Steps:**
1. Open **SQL Editor**
2. Copy **STEP 1-2** only (Extensions + Trigger Function)
3. Run it, verify success
4. Copy **STEP 3** (Drop tables), run, verify
5. Copy **STEP 4** (Core tables), run, verify
6. Continue through STEP 10

**Why this works:**
- If a specific table fails to create, you'll see which one
- You can skip problematic tables or fix them individually

---

## After Schema Creation

Once `founder_context` table exists, you need to populate it for cron jobs to work:

### Insert test data:
```sql
INSERT INTO founder_context (user_id, startup_summary, current_stage, momentum_score)
SELECT 
  id,
  'Test startup',
  'Growth',
  75
FROM auth.users
LIMIT 1;
```

### Verify it worked:
```sql
SELECT user_id, startup_summary, momentum_score FROM founder_context;
```

---

## Verify Cron Jobs Can Run

After schema is complete:

1. **Check founder_context exists:**
   ```sql
   SELECT COUNT(*) FROM founder_context;
   ```

2. **Test morning_briefing job:**
   - Open PowerShell in VS Code
   - Run:
   ```powershell
   npx -y deno run --allow-net https://deno.land/x/dotenv/load.ts; \
   Invoke-WebRequest -Uri http://localhost:8000 -Method Post \
     -Headers @{'Content-Type'='application/json'; 'x-job-secret'='YOUR_CRON_SECRET'} \
     -Body '{"job":"morning_briefing","dry_run":true}' | Select-Object -ExpandProperty Content
   ```

3. **Check logs:**
   ```sql
   SELECT * FROM scheduled_job_log ORDER BY created_at DESC LIMIT 5;
   ```

---

## Common Issues & Solutions

### Issue: "auth.users table not found"
**Cause:** Supabase auth not initialized
**Fix:** 
- New Supabase project should auto-create `auth` schema
- If not, check that auth is enabled in project settings
- Or manually create a test user first

### Issue: "RLS policies can't reference auth.uid()"
**Cause:** RLS policies can't work if no user is logged in
**Fix:** This is expected. Just ignore if querying in SQL Editor without authentication.

### Issue: Still seeing "relation does not exist" after running schema
**Cause:** SQL didn't fully execute or there's a partial failure
**Fix:**
1. Run `schema-diagnostic.sql` to see what exists
2. Manually drop the failed table: `DROP TABLE IF EXISTS founder_context CASCADE;`
3. Re-run just that table's CREATE statement from `schema-chunked.sql`

---

## Files Available

- **schema-minimal.sql** - Full schema, simplest syntax (USE THIS)
- **schema-chunked.sql** - Same schema, 10 steps for debugging
- **schema-diagnostic.sql** - Inspect current database state
- **schema-idempotent.sql** - Original version (may have issues)

---

## Next Steps

1. ✅ Run one of the schema files above
2. ✅ Verify with `SELECT COUNT(*) FROM founder_context;`
3. ✅ Insert test data for cron jobs to process
4. ✅ Deploy scheduled jobs: `npx supabase functions deploy scheduled-jobs --no-verify-jwt`
5. ✅ Test manually via Invoke-WebRequest or Supabase dashboard
6. ✅ Monitor `scheduled_job_log` table for execution records
