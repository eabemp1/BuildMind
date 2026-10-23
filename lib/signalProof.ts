/**
 * lib/signalProof.ts - checks a founder's evidence for a claimed outcome.
 *
 * A typed number proves nothing. Proof is something that can be looked at later: a link to the reply or
 * post, or the pasted text of the reply. This does not (and cannot) prove the evidence is real; it
 * rejects the lazy fakes (empty, mashed keys, the task text echoed back, the same proof used twice) and
 * keeps an audit trail. Proof-backed claims therefore score a little lower than anything BuildMind
 * observed itself (see PROOF_CAP in lib/outcomeSignal.ts). Server side only (uses node:crypto).
 */

import { createHash } from "node:crypto";

export interface ProofCheck {
  ok: boolean;
  kind?: "url" | "text";
  /** Stored for audit. URLs have tracking parameters and fragments removed. */
  normalized?: string;
  /** Same evidence, same hash: used to refuse reusing one proof for several tasks. */
  hash?: string;
  reason?: string;
}

const MIN_TEXT = 40;
const MAX_TEXT = 2000;

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return h.includes(":") || !h.includes(".");
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function checkProof(raw: unknown, taskText = ""): ProofCheck {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: false, reason: "No proof given." };
  if (text.length > MAX_TEXT) return { ok: false, reason: "That is too long. Paste just the reply or the link." };

  if (/^https?:\/\//i.test(text) && !/\s/.test(text)) {
    let u: URL;
    try { u = new URL(text); } catch { return { ok: false, reason: "That link does not look valid." }; }
    if (u.protocol !== "https:") return { ok: false, reason: "Use an https link." };
    if (u.username || u.password) return { ok: false, reason: "Remove the login details from that link." };
    if (isPrivateHost(u.hostname)) return { ok: false, reason: "That link is not a public page." };
    if (u.pathname === "/" && !u.search) return { ok: false, reason: "Link to the specific reply or post, not a home page." };
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(k)) u.searchParams.delete(k);
    const normalized = u.toString();
    return { ok: true, kind: "url", normalized, hash: sha(`url:${normalized.toLowerCase()}`) };
  }

  if (text.length < MIN_TEXT) return { ok: false, reason: `Paste the reply itself (at least ${MIN_TEXT} characters) or a link to it.` };
  const words = norm(text).split(" ").filter((w) => w.length > 1);
  const distinct = new Set(words);
  if (distinct.size < 8) return { ok: false, reason: "That does not look like a real reply. Paste the full message." };
  if (distinct.size / Math.max(1, words.length) < 0.4) return { ok: false, reason: "That looks repeated. Paste the real message." };
  if (taskText && norm(taskText).length > 20 && norm(text).includes(norm(taskText).slice(0, 60))) {
    return { ok: false, reason: "That is the task text, not a reply to it." };
  }
  const normalized = norm(text);
  return { ok: true, kind: "text", normalized: normalized.slice(0, 500), hash: sha(`text:${normalized}`) };
}
