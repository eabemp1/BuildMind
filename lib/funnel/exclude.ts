/** Which accounts are QA or internal, so they never count as founders. Server only. */
export interface ExcludeConfig { adminIds: string[]; emails: string[] }

export function excludeConfigFromEnv(env: Record<string, string | undefined> = process.env): ExcludeConfig {
  const list = (v?: string) => (v ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return { adminIds: list(env.ADMIN_USER_IDS), emails: list(env.FUNNEL_EXCLUDE_EMAILS) };
}

/** An admin, an address listed in FUNNEL_EXCLUDE_EMAILS (full address or a fragment such as "@qa.buildmind"), or a "+qa" tag. */
export function isQaAccount(a: { id: string; email: string | null }, cfg: ExcludeConfig, adminDb: Set<string> = new Set()): boolean {
  if (cfg.adminIds.includes(a.id.toLowerCase()) || adminDb.has(a.id)) return true;
  const e = (a.email ?? "").toLowerCase();
  if (!e) return false;
  return /\+(qa|test)[a-z0-9._-]*@/.test(e) || cfg.emails.some((x) => e === x || e.includes(x));
}
