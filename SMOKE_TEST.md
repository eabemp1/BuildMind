# Smoke test before real users see rounds 14 to 25

Do this on a staging copy or a spare account first. About 20 minutes. Stop at the first failure and note the step.

## 1. Apply the migrations, in this order
1. `20261030010000_project_goals.sql`
2. `20261031000000_break_share_events.sql`
3. `20261101000000_wrong_assumption_audit.sql`
4. `20261101010000_work_items.sql`
5. `20261101020000_conversation_people.sql`

Also confirm the `prepared_work` table exists in the database (Table Editor). The app uses it, but no migration in the repo creates it.

## 2. New account, first run
1. Sign up with a fresh email. In onboarding, leave "who is it for" blank and press Next. You should see one gentle second ask, then it lets you continue.
2. Open Today. You should get one task within a few seconds. It should name at most one channel (no "— on WhatsApp" added to another channel).
3. Open the plain stage label on Today. It should read in everyday words, not "MVP/Launch" jargon only.
4. Finish the task. You should see a short finish screen. After finishing, you may see at most one suggestion (teardown, validation check or follow-ups).
5. Tap "Replace this task" and choose "Assumes something untrue". One optional line appears, then you get a different task.

## 3. Work
1. Open Work from the menu. You see grouped cards and a "Get 5 customer conversations" card at the top.
2. Pick a short kind (for example WhatsApp message), fill the form, press Prepare. You get 2 to 4 versions. Edit one, refresh the page, open Library: your edit is saved.
3. Press "Shorter". The text changes and "Undo last change" brings it back.
4. As a free account after the trial: prepare 3 long documents (for example Pitch outline). The third should say you have used your free long documents and show "See Builder". Short messages must still work.

## 4. Conversations
1. Open the conversations page. Add two people.
2. Open one person, press "Draft first message", then "I sent it". Status shows Message sent.
3. Paste about 3 lines of notes and press "Pull out what matters". Each point must show a quote that is really in your notes.
4. Counters at the top update (talked, contacted, replied).

## 5. Admin
1. Open the admin page. "New founders" shows your test account with a status line and "curated" next to a first-run task.
2. Today quality shows no errors. If you have run the nightly audit, a "Nightly check" block may appear.
3. Run the audit once by hand: `GET /api/cron/audit-today?dryRun=1` with the `CRON_SECRET`. It returns findings without writing anything.

## 6. What to write down
- Any step that failed, with what you saw.
- Any task that assumed something you never said.
- How long Today took to show the first task.
