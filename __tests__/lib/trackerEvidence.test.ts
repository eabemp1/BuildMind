import { describe, it, expect } from "vitest";
import { eventForStatus } from "@/lib/conversations/toExperiment";

describe("tracker to experiment evidence", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  it("records nothing for people not contacted yet", () => {
    expect(eventForStatus(id, "Ama", "to_contact")).toBeNull();
  });
  it("maps each state to what actually happened", () => {
    expect(eventForStatus(id, "Ama", "sent")?.kind).toBe("sent");
    expect(eventForStatus(id, "Ama", "replied")?.kind).toBe("replied");
    expect(eventForStatus(id, "Ama", "booked")?.kind).toBe("replied");
    expect(eventForStatus(id, "Ama", "done")?.kind).toBe("conversation");
    expect(eventForStatus(id, "Ama", "no_reply")?.kind).toBe("no_reply");
  });
  it("carries interview notes only on a finished conversation, and the key is stable", () => {
    expect(eventForStatus(id, "Ama", "done", "Pays 50 cedis a month for WhatsApp tools")?.detail).toContain("50 cedis");
    expect(eventForStatus(id, "Ama", "replied", "private notes")?.detail).not.toContain("private");
    expect(eventForStatus(id, "Ama", "done")?.clientKey).toBe(eventForStatus(id, "Ama", "done")?.clientKey);
    expect(eventForStatus(id, "Ama", "done")!.clientKey).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
  it("needs a name", () => {
    expect(eventForStatus(id, "  ", "sent")).toBeNull();
  });
});
