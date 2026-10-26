import { describe, it, expect, afterEach } from "vitest";
import { generateKeyPairSync, createVerify } from "crypto";
import { signAppJwt, normalisePem, toStoredToken, installationIdFrom, pickRepo, isGithubAppConfigured, userOwnsInstallation } from "@/lib/integrations/githubApp";
import { fetchGithubSummary } from "@/lib/integrations/github";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const KEYS = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_SLUG", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET"];
afterEach(() => { for (const k of KEYS) delete process.env[k]; });

describe("GitHub App token", () => {
  it("signs a JWT GitHub can verify, valid under 10 minutes", () => {
    const jwt = signAppJwt("12345", privateKey, 1_800_000_000);
    const [h, b, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const body = JSON.parse(Buffer.from(b, "base64url").toString());
    expect(body.iss).toBe("12345");
    expect(body.exp - body.iat).toBeLessThanOrEqual(10 * 60);
    expect(createVerify("RSA-SHA256").update(`${h}.${b}`).verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
  });
  it("accepts a key stored with literal \\n", () => {
    const flat = privateKey.replace(/\n/g, "\\n");
    expect(normalisePem(flat)).toBe(privateKey);
    expect(() => signAppJwt("1", flat)).not.toThrow();
  });
});

describe("stored installation marker", () => {
  it("round-trips and rejects anything else", () => {
    expect(installationIdFrom(toStoredToken(98765))).toBe("98765");
    expect(installationIdFrom("ghapp:abc")).toBeNull();
    expect(installationIdFrom("github_pat_" + "a".repeat(30))).toBeNull();
    expect(installationIdFrom("ghapp:../../x")).toBeNull();
  });
});

describe("repo choice and configuration", () => {
  it("picks the most recently pushed repo", () => {
    expect(pickRepo([{ full_name: "a/old", pushed_at: "2026-01-01T00:00:00Z" }, { full_name: "a/new", pushed_at: "2026-10-20T00:00:00Z" }])).toBe("a/new");
    expect(pickRepo([])).toBeNull();
  });
  it("is off unless all five variables are set", () => {
    expect(isGithubAppConfigured()).toBe(false);
    for (const k of KEYS.slice(0, 4)) process.env[k] = "x";
    expect(isGithubAppConfigured()).toBe(false);
    process.env.GITHUB_APP_CLIENT_SECRET = "x";
    expect(isGithubAppConfigured()).toBe(true);
  });
});

describe("safety", () => {
  it("never trusts an installation without the GitHub sign-in code", async () => {
    expect(await userOwnsInstallation("", "123")).toBe(false);
    process.env.GITHUB_APP_CLIENT_ID = "x"; process.env.GITHUB_APP_CLIENT_SECRET = "y";
    expect(await userOwnsInstallation("", "123")).toBe(false);
  });
  it("a stored installation with no App configured fails closed, not open", async () => {
    const r = await fetchGithubSummary(toStoredToken(123), "owner/name");
    expect(r.ok).toBe(false);
  });
  it("pasted tokens still need the right shape", async () => {
    expect((await fetchGithubSummary("not-a-token", "owner/name")).ok).toBe(false);
  });
});
