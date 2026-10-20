/** A small in-memory stand-in for the Supabase admin client. Enough to run the real routes end to end. */
import { randomUUID } from "crypto";
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export class FakeDb {
  tables: Record<string, Row[]> = {};
  failTables = new Set<string>();
  constructor(seed: Record<string, Row[]> = {}) { this.tables = JSON.parse(JSON.stringify(seed)); }
  from(name: string) { return new Query(this, name); }
  rows(name: string): Row[] { return (this.tables[name] ??= []); }
}

class Query implements PromiseLike<{ data: unknown; error: { message: string } | null; count?: number }> {
  private filters: Filter[] = [];
  private mode: "select" | "update" | "delete" | "upsert" | "insert" = "select";
  private patch: Row = {};
  private upsertRow: Row = {};
  private onConflict: string[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private max = Infinity;
  private head = false;
  private singleMode: "none" | "one" | "maybe" = "none";
  private cols: string | null = null;
  constructor(private db: FakeDb, private table: string) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) { this.cols = cols ?? "*"; if (opts?.head) this.head = true; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  gte(c: string, v: unknown) { this.filters.push((r) => String(r[c] ?? "") >= String(v)); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = { col, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  single() { this.singleMode = "one"; return this; }
  update(p: Row) { this.mode = "update"; this.patch = p; return this; }
  delete() { this.mode = "delete"; return this; }
  insert(r: Row) { this.mode = "insert"; this.upsertRow = r; return this; }
  upsert(r: Row, opts?: { onConflict?: string }) { this.mode = "upsert"; this.upsertRow = r; this.onConflict = (opts?.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean); return this; }

  then<T1, T2>(ok?: (v: { data: unknown; error: { message: string } | null; count?: number }) => T1, bad?: (e: unknown) => T2) { return Promise.resolve(this.run()).then(ok, bad); }

  private run(): { data: unknown; error: { message: string } | null; count?: number } {
    if (this.db.failTables.has(this.table)) return { data: null, error: { message: `relation "${this.table}" does not exist` } };
    const rows = this.db.rows(this.table);
    if (this.mode === "insert") { const r = { id: randomUUID(), ...this.upsertRow }; rows.push(r); return { data: this.singleMode !== "none" || this.cols ? r : null, error: null }; }
    if (this.mode === "upsert") {
      const existing = this.onConflict.length ? rows.find((r) => this.onConflict.every((c) => r[c] === this.upsertRow[c])) : undefined;
      let out: Row;
      if (existing) { Object.assign(existing, this.upsertRow); out = existing; } else { out = { id: randomUUID(), created_at: new Date().toISOString(), ...this.upsertRow }; rows.push(out); }
      return { data: this.cols ? { ...out } : null, error: null };
    }
    let hit = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === "update") { hit.forEach((r) => Object.assign(r, this.patch)); return { data: null, error: null }; }
    if (this.mode === "delete") { this.db.tables[this.table] = rows.filter((r) => !hit.includes(r)); return { data: null, error: null }; }
    if (this.orderBy) { const { col, asc } = this.orderBy; hit = [...hit].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (asc ? 1 : -1)); }
    hit = hit.slice(0, this.max);
    if (this.head) return { data: null, error: null, count: hit.length };
    if (this.singleMode === "maybe" || this.singleMode === "one") return { data: hit[0] ?? null, error: null };
    return { data: hit, error: null };
  }
}
