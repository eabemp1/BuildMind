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
}

export interface NotionContext {
  tasks:          NotionTask[];
  workspaceName?: string;
  error?:         string;
}

function notionHeaders(token: string) {
  return {
    "Authorization":    `Bearer ${token}`,
    "Notion-Version":   NOTION_VERSION,
    "Content-Type":     "application/json",
  };
}

/**
 * fetchNotionContext — pulls incomplete tasks from the founder's Notion DB.
 * Returns empty tasks array (not an error) if the DB has no incomplete items.
 *
 * @param accessToken  — from integrations table
 * @param databaseId   — the Notion DB to query (stored on first connection)
 */
export async function fetchNotionContext(
  accessToken: string,
  databaseId: string,
): Promise<NotionContext> {
  try {
    const body = JSON.stringify({
      filter: {
        or: [
          // Unchecked checkbox pages
          { property: "Done",   checkbox: { equals: false } },
          // Status property not "Done" or "Completed"
          { property: "Status", status:   { does_not_equal: "Done" } },
        ],
      },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 10,
    });

    const res = await fetch(`${NOTION_API}/databases/${databaseId}/query`, {
      method:  "POST",
      headers: notionHeaders(accessToken),
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { tasks: [], error: `Notion API ${res.status}: ${(err as { message?: string }).message ?? "unknown"}` };
    }

    const data = await res.json() as { results?: NotionPage[] };

    const tasks: NotionTask[] = (data.results ?? []).map((page: NotionPage) => {
      const titleProp = Object.values(page.properties ?? {}).find(
        (p): p is TitleProperty => p.type === "title"
      );
      const title = titleProp?.title?.map((t) => t.plain_text).join("") ?? "Untitled";

      const statusProp = Object.values(page.properties ?? {}).find(
        (p): p is StatusProperty => p.type === "status"
      );
      const status = statusProp?.status?.name ?? "Unknown";

      const dateProp = Object.values(page.properties ?? {}).find(
        (p): p is DateProperty => p.type === "date"
      );
      const dueDate = dateProp?.date?.start ?? null;

      return { id: page.id, title, status, dueDate, url: page.url };
    });

    return { tasks };
  } catch (err) {
    return { tasks: [], error: String(err) };
  }
}

/**
 * formatNotionContextForPrompt — converts Notion tasks into a
 * compact prompt-injectable string for the Reflexion Generator.
 */
export function formatNotionContextForPrompt(ctx: NotionContext): string {
  if (ctx.error || ctx.tasks.length === 0) return "";
  const lines = ctx.tasks.map(t => {
    const due = t.dueDate ? ` (due ${t.dueDate})` : "";
    return `  - ${t.title}${due} [${t.status}]`;
  });
  return `\nFOUNDER'S ACTIVE NOTION TASKS (real work already on their plate):\n${lines.join("\n")}\nAccount for these when choosing today's task — don't duplicate effort.`;
}

// ── Notion API types (partial) ─────────────────────────────────────────────────
interface NotionPage {
  id:         string;
  url:        string;
  properties: Record<string, NotionProperty>;
}

type NotionProperty = TitleProperty | StatusProperty | DateProperty | { type: string };

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
