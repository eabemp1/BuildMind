import { describe, it, expect } from "vitest";
import { checkProof } from "@/lib/signalProof";

describe("checkProof", () => {
  it("rejects empty, short and mashed text", () => {
    expect(checkProof("").ok).toBe(false);
    expect(checkProof("got a reply").ok).toBe(false);
    expect(checkProof("asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf").ok).toBe(false);
    expect(checkProof("a".repeat(60)).ok).toBe(false);
  });
  it("accepts a pasted reply and hashes it stably", () => {
    const t = "Hi Kwame, thanks for reaching out. I would love to try this next week, can we book a call on Tuesday afternoon?";
    const a = checkProof(t); const b = checkProof("  " + t.toUpperCase() + " ");
    expect(a.ok).toBe(true);
    expect(a.kind).toBe("text");
    expect(a.hash).toBe(b.hash);
  });
  it("rejects the task text echoed back", () => {
    const task = "Message 3 freelancers on WhatsApp and ask how they chase unpaid invoices";
    expect(checkProof(`${task} and then some more words to pad this out nicely`, task).ok).toBe(false);
  });
  it("accepts a specific https link and strips tracking", () => {
    const r = checkProof("https://www.reddit.com/r/startups/comments/abc123/my_post/?utm_source=share#c1");
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("url");
    expect(r.normalized).toBe("https://www.reddit.com/r/startups/comments/abc123/my_post/");
  });
  it("rejects http, private hosts, home pages, credentials and junk", () => {
    expect(checkProof("http://example.com/a/b").ok).toBe(false);
    expect(checkProof("https://localhost/a/b").ok).toBe(false);
    expect(checkProof("https://192.168.1.5/a/b").ok).toBe(false);
    expect(checkProof("https://example.com/").ok).toBe(false);
    expect(checkProof("https://user:pw@example.com/a").ok).toBe(false);
    expect(checkProof("https://x").ok).toBe(false);
  });
  it("the same link with different tracking hashes the same", () => {
    expect(checkProof("https://example.com/a/b?utm_medium=x").hash).toBe(checkProof("https://example.com/a/b").hash);
  });
});
