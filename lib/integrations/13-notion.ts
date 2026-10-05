/**
 * lib/integrations/notion.ts — Notion context fetcher
 *
 * Audit v8 PROD #8: "One integration beats ten features. A Notion integration
 * that reads the founder's task list and feeds it as context into the reflexion
 * pipeline would make every output dramatically more specific."
 *
 * HOW IT WORKS:
 *   1. Founder connects Notion via OAuth (stores access_token + workspace_id in integrations table)
 *   2. On each today-action call, fetchNotionContext() queries their Notion DB for
 *      incomplete tasks due today or overdue
 *   3. The tasks are injected into the reflexion Generator prompt as real-world context
 *   4. The AI knows what the founder already has on their plate — no generic output possible
 *
 * SETUP:
 *   1. Create a Notion integration at https://www.notion.so/my-integrations
 *   2. Set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET env vars
 *   3. Add OAuth callback route at /api/integrations/notion/callback
 *   4. The integrations table stores: user_id, provider, access_token, workspace_id, database_id
 *
 * SCHEMA REQUIREMENT (add to a migration):
 *   CREATE TABLE IF NOT EXISTS integrations (
 *     id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *     provider     text NOT NULL CHECK (provider IN ('notion', 'linear')),
 *     access_token text NOT NULL,
 *     workspace_id text,
 *     database_id  text,     -- Notion DB ID or Linear team ID
 *     metadata     jsonb,
 *     created_at   timestamptz DEFAULT now(),
 *     updated_at   timestamptz DEFAULT now(),
 *     UNIQUE (user_id, provider)
 *   );
 */

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export interface NotionTask {
  id:      string;
  title:   string;
  status:  string;
  dueDate: string | null;
  url:     string;
  done:    boolean;
  editedAt: string | null;
}

export interface NotionContext {
  tasks:          NotionTask[];
  /** Tasks marked done and edited in the last 14 days: evidence of real output. */
  shipped:        NotionTask[];
  workspaceName?: string;
  error?:         string;
  /** "auth" means the token was revoked or expired and the founder must reconnect. */
  errorKind?:     "auth" | "other";
}

function notionHeaders(token: string) {
  return {
    "Authorization":    `Bearer ${token}`,
    "Notion-Version":   NOTION_VERSION,
    "Content-Type":     "application/json",
  };
}

const DONE_WORDS = /^(done|complete|completed|shipped|closed|finished|released|resolved)$/i;
const TASKY_TITLE = /(task|to-?do|backlog|sprint|roadmap|tracker|project|action|issue|kanban|board)/i;

interface DbSchemaProp { type: string; name?: string }
interface DbSummary { id: string; title?: Array<{ plain_text: string }>; properties?: Record<string, DbSchemaProp>; last_edited_time?: string }

/**
 * pickTaskDatabase — the connect flow used to take the FIRST database the
 * search returned, which is often a wiki, CRM or meeting-notes table. Score the
 * candidates instead: a status or checkbox property is what makes a database a
 * task list; a task-like name and a date property are extra signal; recent
 * edits break ties.
 */
export function pickTaskDatabase(dbs: DbSummary[]): string | null {
  let best: { id: string; score: number } | null = null;
  for (const db of dbs) {
    const props = Object.values(db.properties ?? {});
    const hasStatus = props.some(p => p.type === "status" || p.type === "select");
    const hasCheckbox = props.some(p => p.type === "checkbox");
    if (!hasStatus && !hasCheckbox) continue;
    const name = (db.title ?? []).map(t => t.plain_text).join("");
    let score = 0;
    if (props.some(p => p.type === "status")) score += 4;
    if (hasCheckbox) score += 3;
    if (props.some(p => p.type === "select")) score += 1;
    if (props.some(p => p.type === "date")) score += 1;
    if (TASKY_TITLE.test(name)) score += 4;
    if (db.last_edited_time) {
      const ageDays = (Date.now() - new Date(db.last_edited_time).getTime()) / 86_400_000;
      if (ageDays < 14) score += 2; else if (ageDays < 60) score += 1;
    }
    if (!best || score > best.score) best = { id: db.id, score };
  }
  return best?.id ?? null;
}

async function timedFetch(url: string, init: RequestInit, ms = 4000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

/**
 * fetchNotionContext — reads the founder's task database using ITS OWN schema.
 * The old query hard-coded "Done" and "Status" property names, so a database
 * without exactly those names failed validation and silently returned nothing
 * while Settings still said "connected".
 */
export async function fetchNotionContext(
  accessToken: string,
  databaseId: string,
): Promise<NotionContext> {
  try {
    const schemaRes = await timedFetch(`${NOTION_API}/databases/${databaseId}`, { headers: notionHeaders(accessToken) });
    if (!schemaRes.ok) {
      const kind = schemaRes.status === 401 || schemaRes.status === 403 || schemaRes.status === 404 ? "auth" : "other";
      return { tasks: [], shipped: [], error: `Notion API ${schemaRes.status}`, errorKind: kind };
    }
    const schema = await schemaRes.json() as { properties?: Record<string, DbSchemaProp> };
    const entries = Object.entries(schema.properties ?? {});
    const statusEntry = entries.find(([, p]) => p.type === "status");
    const checkboxEntry = entries.find(([, p]) => p.type === "checkbox");

    const body: Record<string, unknown> = {
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 30,
    };
    // Only filter on a property that really exists; otherwise read recent pages and classify locally.
    if (statusEntry) body.filter = { property: statusEntry[0], status: { is_not_empty: true } };
    else if (checkboxEntry) body.filter = { property: checkboxEntry[0], checkbox: { is_not_empty: true } };

    const res = await timedFetch(`${NOTION_API}/databases/${databaseId}/query`, {
      method: "POST", headers: notionHeaders(accessToken), body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { tasks: [], shipped: [], error: `Notion API ${res.status}: ${(err as { message?: string }).message ?? "unknown"}`, errorKind: res.status === 401 ? "auth" : "other" };
    }

    const data = await res.json() as { results?: NotionPage[] };
    const all: NotionTask[] = (data.results ?? []).map((page: NotionPage) => {
      const props = Object.values(page.properties ?? {});
      const titleProp = props.find((p): p is TitleProperty => p.type === "title");
      const title = titleProp?.title?.map((t) => t.plain_text).join("") ?? "Untitled";
      const statusProp = props.find((p): p is StatusProperty => p.type === "status");
      const checkProp = props.find((p): p is CheckboxProperty => p.type === "checkbox");
      const status = statusProp?.status?.name ?? (checkProp ? (checkProp.checkbox ? "Done" : "Open") : "Unknown");
      const dateProp = props.find((p): p is DateProperty => p.type === "date");
      const done = checkProp ? checkProp.checkbox === true : DONE_WORDS.test(status.trim());
      return { id: page.id, title, status, dueDate: dateProp?.date?.start ?? null, url: page.url, done, editedAt: page.last_edited_time ?? null };
    }).filter(t => t.title.trim() && t.title !== "Untitled");

    const cutoff = Date.now() - 14 * 86_400_000;
    return {
      tasks: all.filter(t => !t.done).slice(0, 10),
      shipped: all.filter(t => t.done && t.editedAt && new Date(t.editedAt).getTime() >= cutoff).slice(0, 8),
    };
  } catch (err) {
    return { tasks: [], shipped: [], error: String(err), errorKind: "other" };
  }
}

/**
 * formatNotionContextForPrompt — converts Notion tasks into a
 * compact prompt-injectable string for the Reflexion Generator.
 */
export function formatNotionContextForPrompt(ctx: NotionContext): string {
  if (ctx.error || (ctx.tasks.length === 0 && ctx.shipped.length === 0)) return "";
  const parts: string[] = [];
  if (ctx.tasks.length) {
    const lines = ctx.tasks.map(t => `  - ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""} [${t.status}]`);
    parts.push(`FOUNDER'S OPEN NOTION TASKS (real work already on their plate):\n${lines.join("\n")}`);
  }
  if (ctx.shipped.length) {
    parts.push(`MARKED DONE IN NOTION IN THE LAST 14 DAYS (real output; do not repeat it):\n${ctx.shipped.map(t => `  - ${t.title}`).join("\n")}`);
  }
  return `\n${parts.join("\n")}\nAccount for these when choosing today's task. Do not duplicate effort, and prefer the task that unblocks or follows the work already in flight.`;
}

// ── Notion API types (partial) ─────────────────────────────────────────────────
interface NotionPage {
  id:         string;
  url:        string;
  last_edited_time?: string;
  properties: Record<string, NotionProperty>;
}

type NotionProperty = TitleProperty | StatusProperty | DateProperty | CheckboxProperty | { type: string };

interface CheckboxProperty {
  type: "checkbox";
  checkbox: boolean;
}

interface TitleProperty {
  type: "title";
  title: Array<{ plain_text: string }>;
}

interface StatusProperty {
  type: "status";
  status: { name: string } | null;
}

interface DateProperty {
  type: "date";
  date: { start: string } | null;
}
