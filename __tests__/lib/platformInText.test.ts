import { describe, it, expect } from "vitest";
import { namedPlatform } from "@/lib/today/platformInText";

const allowed = ["LinkedIn", "WhatsApp", "email", "Twitter", "Slack"];

describe("namedPlatform", () => {
  it("finds an allowed channel in the sentence", () => {
    expect(namedPlatform("Send direct messages to 3 founders on Twitter asking how they did it", allowed)).toBe("Twitter");
  });
  it("finds other common channels too", () => {
    expect(namedPlatform("Post in the Discord server and ask 3 people", allowed)).toBe("Discord");
    expect(namedPlatform("Message 3 people on X", allowed)).toBe("X");
  });
  it("does not match inside other words", () => {
    expect(namedPlatform("Explain the next step to 3 people", allowed)).toBeNull();
    expect(namedPlatform("Email 3 people", allowed)).toBe("email");
  });
  it("returns null when none is named", () => {
    expect(namedPlatform("Ask 3 people what they did last time", allowed)).toBeNull();
  });
});
