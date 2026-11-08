import { describe, it, expect } from "vitest";
import { readFirstTask, fallbackFirstTask } from "@/lib/break/firstTask";

const good = {
  task: "Ask one person you know how they compare food prices before they buy.",
  message: "Hi [name], I'm curious how you decide where to buy food online. Could I ask you 3 quick questions? It takes 10 minutes.",
};

describe("readFirstTask", () => {
  it("accepts a plain task and message", () => { expect(readFirstTask(good)).toEqual(good); });
  it("rejects missing, short or non-object input", () => {
    expect(readFirstTask(null)).toBeNull();
    expect(readFirstTask({ task: "Do it", message: good.message })).toBeNull();
    expect(readFirstTask({ task: good.task, message: "Hi" })).toBeNull();
  });
  it("rejects a task that is too long, technical, or asks for hours", () => {
    expect(readFirstTask({ ...good, task: "x ".repeat(120) })).toBeNull();
    expect(readFirstTask({ ...good, task: "Scrape the price of rice from three shop websites today." })).toBeNull();
    expect(readFirstTask({ ...good, task: "Spend the next two hours copying prices from three shop sites." })).toBeNull();
  });
  it("allows only [name] as a placeholder, and the message must ask something", () => {
    expect(readFirstTask({ ...good, message: "Hi [name], I'm working on [your product]. Could I ask you 3 quick questions today?" })).toBeNull();
    expect(readFirstTask({ ...good, message: "Hi [name], I am looking at how people buy food online and would love your view." })).toBeNull();
  });
});

describe("fallbackFirstTask", () => {
  it("is itself valid and pastes none of the founder's text", () => {
    const f = fallbackFirstTask();
    expect(readFirstTask(f)).toEqual(f);
  });
});
