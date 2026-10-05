/**
 * lib/integrations/linear.ts — Linear context fetcher
 *
 * Audit v8 PROD #8: integration layer for Linear task context.
 * Works identically to the Notion integration — pulls the founder's
 * in-progress and backlog issues from Linear and injects them into the
 * Reflexion Generator prompt.
 *
 * SETUP:
 *   1. Create a Linear OAuth app at https://linear.app/settings/api/applications/new
 *   2. Set LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET env vars
 *   3. Add OAuth callback route at /api/integrations/linear/callback
 *   4. Stores in integrations table: provider="linear", access_token, database_id=teamId
 */

const LINEAR_API = "https://api.linear.app/graphql";

export interface LinearIssue {
  id:         string;
  title:      string;
  state:      string;
  stateType:  string;
  priority:   number; // 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
  url:        string;
  dueDate:    string | null;
  completedAt: string | null;
}

export interface LinearContext {
  issues: LinearIssue[];
  /** Completed in the last 14 days. */
  shipped: LinearIssue[];
  error?: string;
  errorKind?: "auth" | "other";
}

/**
 * fetchLinearContext — open issues assigned to the founder plus what they
 * closed in the last 14 days. The shipped list matters as much as the open
 * list: it is the clearest evidence of real output and stops the coach from
 * suggesting work that is already finished.
 */
export async function fetchLinearContext(accessToken: string): Promise<LinearContext> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const query = `
    query MyWork($since: DateTimeOrDuration!) {
      viewer {
        open: assignedIssues(
          filter: { state: { type: { nin: ["completed", "cancelled", "triage"] } } }
          orderBy: updatedAt
          first: 25
        ) { nodes { id title url dueDate priority state { name type } } }
        done: assignedIssues(
          filter: { completedAt: { gte: $since } }
          orderBy: updatedAt
          first: 15
        ) { nodes { id title url completedAt state { name type } } }
      }
    }
  `;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch(LINEAR_API, {
      method:  "POST",
      signal:  ctl.signal,
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { since } }),
    });

    if (!res.ok) {
      return { issues: [], shipped: [], error: `Linear API ${res.status}`, errorKind: res.status === 401 || res.status === 403 ? "auth" : "other" };
    }

    const data = await res.json() as LinearApiResponse;
    if (data.errors?.length) {
      const authish = data.errors.some(e => /auth|token|unauthor/i.test(e.message ?? ""));
      return { issues: [], shipped: [], error: data.errors[0]?.message ?? "Linear error", errorKind: authish ? "auth" : "other" };
    }
    const toIssue = (n: LinearNode): LinearIssue => ({
      id: n.id, title: n.title, state: n.state?.name ?? "Unknown", stateType: n.state?.type ?? "",
      priority: n.priority ?? 0, url: n.url, dueDate: n.dueDate ?? null, completedAt: n.completedAt ?? null,
    });
    // Started work first, then by urgency (1 is most urgent; 0 means unset and sorts last).
    const rank = (i: LinearIssue) => (i.stateType === "started" ? 0 : 10) + (i.priority === 0 ? 5 : i.priority);
    const issues = (data?.data?.viewer?.open?.nodes ?? []).map(toIssue).sort((a, b) => rank(a) - rank(b)).slice(0, 10);
    const shipped = (data?.data?.viewer?.done?.nodes ?? []).map(toIssue);
    return { issues, shipped };
  } catch (err) {
    return { issues: [], shipped: [], error: String(err), errorKind: "other" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * formatLinearContextForPrompt — converts Linear issues into a
 * compact prompt-injectable string for the Reflexion Generator.
 */
export function formatLinearContextForPrompt(ctx: LinearContext): string {
  if (ctx.error || (ctx.issues.length === 0 && ctx.shipped.length === 0)) return "";
  const PRIORITY_LABEL = ["", "Urgent", "High", "Medium", "Low"];
  const parts: string[] = [];
  if (ctx.issues.length) {
    const lines = ctx.issues.map(i => {
      const priority = PRIORITY_LABEL[i.priority] ?? "";
      return `  - ${i.title} [${i.state}]${priority ? ` ${priority}` : ""}${i.dueDate ? ` (due ${i.dueDate})` : ""}`;
    });
    parts.push(`FOUNDER'S OPEN LINEAR ISSUES (engineering work in flight):\n${lines.join("\n")}`);
  }
  if (ctx.shipped.length) {
    parts.push(`CLOSED IN LINEAR IN THE LAST 14 DAYS (real output; do not repeat it):\n${ctx.shipped.map(i => `  - ${i.title}`).join("\n")}`);
  }
  return `\n${parts.join("\n")}\nAccount for these when choosing today's task. If a lot is being built and little has reached a user, the best task is usually to put what is already built in front of someone.`;
}

// ── Linear API response types (partial) ───────────────────────────────────────
interface LinearNode {
  id:       string;
  title:    string;
  url:      string;
  dueDate?: string | null;
  completedAt?: string | null;
  priority?: number;
  state?:   { name: string; type: string };
}
interface LinearApiResponse {
  errors?: Array<{ message?: string }>;
  data?: {
    viewer?: {
      open?: { nodes: LinearNode[] };
      done?: { nodes: LinearNode[] };
    };
  };
}
