/**
 * __tests__/components/PythonCode.test.ts
 *
 * Tests for the tokenize() function in components/journey/PythonCode.tsx —
 * pure, no rendering, no DOM needed. Checks that the four token kinds are
 * classified correctly on real snippets pulled from lib/journeyContent.ts,
 * and that reassembling all tokens reproduces the original string exactly
 * (the one invariant that matters most — losing or duplicating characters
 * would silently corrupt what's shown).
 */

import { describe, it, expect } from "vitest";
import { tokenize } from "../../components/journey/PythonCode";
import { JOURNEY_LESSONS } from "../../lib/journeyContent";

function kindsOf(code: string) {
  return tokenize(code).map((t) => t.kind);
}

describe("tokenize — reconstruction invariant", () => {
  it("reassembling every token's text reproduces the original string exactly", () => {
    const samples = [
      "def greet(name):\n    return f'Hello {name}'",
      "# a comment\nx = 5  # inline comment",
      "s = 'it\\'s a test'",
      "d = \"\"\"triple\nquoted\"\"\"",
      "for i in range(10):\n    print(i)",
    ];
    for (const code of samples) {
      const reconstructed = tokenize(code).map((t) => t.text).join("");
      expect(reconstructed).toBe(code);
    }
  });
});

describe("tokenize — classification", () => {
  it("classifies a keyword correctly", () => {
    const tokens = tokenize("def foo(): pass");
    const kinds = tokens.filter((t) => t.text === "def" || t.text === "pass").map((t) => t.kind);
    expect(kinds).toEqual(["keyword", "keyword"]);
  });

  it("classifies a builtin correctly", () => {
    const tokens = tokenize("print(len(x))");
    const printToken = tokens.find((t) => t.text === "print");
    const lenToken = tokens.find((t) => t.text === "len");
    expect(printToken?.kind).toBe("builtin");
    expect(lenToken?.kind).toBe("builtin");
  });

  it("classifies a single-quoted string as one string token", () => {
    const tokens = tokenize("x = 'hello world'");
    const stringToken = tokens.find((t) => t.kind === "string");
    expect(stringToken?.text).toBe("'hello world'");
  });

  it("classifies a double-quoted string as one string token", () => {
    const tokens = tokenize('x = "hello world"');
    const stringToken = tokens.find((t) => t.kind === "string");
    expect(stringToken?.text).toBe('"hello world"');
  });

  it("classifies a comment as one token running to end of line", () => {
    const tokens = tokenize("x = 5  # this is a comment\ny = 6");
    const commentToken = tokens.find((t) => t.kind === "comment");
    expect(commentToken?.text).toBe("# this is a comment");
  });

  it("does NOT recolor a keyword-looking word that appears inside a string", () => {
    const tokens = tokenize("x = 'return to sender'");
    // 'return' should be swallowed into the string token, not separately
    // tokenized as a keyword.
    const kinds = tokenize("x = 'return to sender'").map((t) => t.kind);
    expect(kinds).not.toContain("keyword");
    expect(tokens.some((t) => t.kind === "string" && t.text.includes("return"))).toBe(true);
  });

  it("does NOT recolor a keyword-looking word that appears inside a comment", () => {
    const tokens = tokenize("# def is a keyword but this is a comment");
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toEqual(["comment"]);
  });

  it("classifies a number correctly", () => {
    const tokens = tokenize("x = 42");
    const numberToken = tokens.find((t) => t.kind === "number");
    expect(numberToken?.text).toBe("42");
  });

  it("classifies a decimal number correctly", () => {
    const tokens = tokenize("pi = 3.14");
    const numberToken = tokens.find((t) => t.kind === "number");
    expect(numberToken?.text).toBe("3.14");
  });

  it("classifies an ordinary identifier as plain, not keyword/builtin", () => {
    const tokens = tokenize("my_variable = 5");
    const idToken = tokens.find((t) => t.text === "my_variable");
    expect(idToken?.kind).toBe("plain");
  });

  it("handles a real multi-line snippet from the curriculum content without losing any tokens", () => {
    const code =
      "def safe_divide(a, b):\n" +
      "    try:\n" +
      "        return a / b\n" +
      "    except ZeroDivisionError:\n" +
      "        return None";
    const tokens = tokenize(code);
    const kinds = new Set(tokens.map((t) => t.kind));
    expect(kinds.has("keyword")).toBe(true);
    expect(tokens.map((t) => t.text).join("")).toBe(code);
  });
});

describe("tokenize — every real curriculum code example", () => {
  it("reconstructs every one of the 16 real codeExample snippets exactly, with no crash", () => {
    expect(JOURNEY_LESSONS.length).toBe(16);
    for (const lesson of JOURNEY_LESSONS) {
      const code = lesson.codeExample.code;
      const tokens = tokenize(code);
      const reconstructed = tokens.map((t) => t.text).join("");
      expect(reconstructed).toBe(code);
    }
  });
});
