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
  priority:   number; // 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
  url:        string;
  dueDate:    string | null;
}

export interface LinearContext {
  issues: LinearIssue[];
  error?: string;
}

/**
 * fetchLinearContext — pulls active issues assigned to the founder.
 *
 * @param accessToken — from integrations table
 */
export async function fetchLinearContext(accessToken: string): Promise<LinearContext> {
  const query = `
    query MyIssues {
      viewer {
        assignedIssues(
          filter: { state: { type: { nin: ["completed", "cancelled"] } } }
          orderBy: updatedAt
          first: 10
        ) {
          nodes {
            id
            title
            url
            dueDate
            priority
            state { name type }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(LINEAR_API, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      return { issues: [], error: `Linear API ${res.status}` };
    }

    const data = await res.json() as LinearApiResponse;
    const nodes = data?.data?.viewer?.assignedIssues?.nodes ?? [];

    const issues: LinearIssue[] = nodes.map(n => ({
      id:       n.id,
      title:    n.title,
      state:    n.state?.name ?? "Unknown",
      priority: n.priority ?? 0,
      url:      n.url,
      dueDate:  n.dueDate ?? null,
    }));

    return { issues };
  } catch (err) {
    return { issues: [], error: String(err) };
  }
}

/**
 * formatLinearContextForPrompt — converts Linear issues into a
 * compact prompt-injectable string for the Reflexion Generator.
 */
export function formatLinearContextForPrompt(ctx: LinearContext): string {
  if (ctx.error || ctx.issues.length === 0) return "";
  const PRIORITY_LABEL = ["", "🔴 Urgent", "🟠 High", "🟡 Medium", "🟢 Low"];
  const lines = ctx.issues.map(i => {
    const priority = PRIORITY_LABEL[i.priority] ?? "";
    const due = i.dueDate ? ` (due ${i.dueDate})` : "";
    return `  - ${i.title} [${i.state}]${priority ? ` ${priority}` : ""}${due}`;
  });
  return `\nFOUNDER'S ACTIVE LINEAR ISSUES (real engineering/product work in flight):\n${lines.join("\n")}\nAccount for these when choosing today's task — don't duplicate effort.`;
}

// ── Linear API response types (partial) ───────────────────────────────────────
interface LinearApiResponse {
  data?: {
    viewer?: {
      assignedIssues?: {
        nodes: Array<{
          id:       string;
          title:    string;
          url:      string;
          dueDate?: string | null;
          priority?: number;
          state?:   { name: string; type: string };
        }>;
      };
    };
  };
}
