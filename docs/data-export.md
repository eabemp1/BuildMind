# Data export: format, privacy and compatibility

Download from Settings → Your data. Four request types on `GET /api/user/export`:

| `format` | Returns |
|---|---|
| `json` (default) | The complete export described below. |
| `report` | A readable HTML summary. Your own records and AI interpretations are in separate, labelled sections. Print it to PDF from the browser. |
| `csv` + `table=` | One flat table. Nested columns (lists and objects) are left out and named in the `X-Export-Omitted-Columns` response header. Cells that start with `= + - @` get a leading apostrophe so a spreadsheet does not run them. |
| `manifest` | What a download contains (categories, which are AI-written, which hold other people's data, what is left out). No rows are read. |

## JSON structure (`schema_version` "2.0")

| Field | Meaning |
|---|---|
| `schema_version` | Version of this structure. New optional fields may be added in minor versions. Existing fields are not renamed or removed within a major version. |
| `exported_at` | When the file was made (UTC, ISO 8601). |
| `user_id`, `email` | The account the file belongs to. |
| `complete` | `true` only when no category failed and none was cut short. Categories whose table does not exist in your account are listed as `unavailable` and do not make the file incomplete. |
| `summary` | Counts of categories by status, total rows, and truncated categories. |
| `manifest[]` | One entry per category: `table`, `label`, `group`, `status` (`exported`, `empty`, `unavailable`, `failed`), `exported_rows`, `total_rows`, `truncated`, `reason` (plain language), `redacted_fields`, `contains_third_party_data`, `ai_generated`. |
| `excluded[]` | Tables that hold your id but are left out on purpose, with the reason. |
| `tables` | The rows, keyed by table name, newest first. |
| `skipped`, `truncated` | Version 1 fields, kept for compatibility: tables that were unavailable or failed, and tables cut at the row limit. |
| `notes` | Short reminders about redaction, AI-written content and other people's data. |

Rules: a category is never silently missing. Credential-looking fields (access and refresh tokens, API keys, secrets, passwords, share and confirmation tokens) are removed and named in `redacted_fields`. Each table is capped at 20,000 rows (newest first) and the cap is reported.

## What is AI-written

Categories with `ai_generated: true` (memory notes, briefings, agent findings, prepared drafts, recommendation logs, weekly reports and similar) are model interpretations of your data. They can be wrong and are not facts about you.

## Privacy and handling

- Only the signed-in user's own id is used in queries. The request carries no id, so there is nothing to change to reach another account.
- The file is built when you press Download, sent in that response, and not stored on our servers. Responses are marked `no-store`.
- Errors shown to you are plain-language. Internal error text is written to the server log, never to the file.
- `signal_events` can contain emails typed by people who visited your pages. The manifest flags it. Treat those addresses as that person's data.
- Left out on purpose: connected-app credentials, device push keys, the private Radar calendar link, anti-abuse and internal analytics records.

## Import and restore

Not available. A download is not a safe restore file. Restoring needs a versioned import schema, per-record ownership checks, duplicate and conflict handling, and rollback. That is a separate project.
