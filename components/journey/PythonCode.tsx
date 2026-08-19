"use client";

/**
 * components/journey/PythonCode.tsx — lightweight Python syntax highlighting.
 *
 * Deliberately NOT Shiki/Prism/highlight.js — those are built for
 * arbitrary languages and large documents; here it's always short,
 * illustrative Python snippets (lib/journeyContent.ts's codeExample
 * fields), so a small regex tokenizer is enough and adds zero new
 * dependencies. If this ever needs to highlight other languages or handle
 * pathological input, that's the point to reach for a real library —
 * not before.
 *
 * Deliberately simple, not a full parser: it does NOT track multi-line
 * triple-quoted strings across a `#` inside them, nested f-string
 * expressions, or similar edge cases — none of which appear in the
 * curated code examples this renders. Good enough for its actual job.
 */

const KEYWORDS = new Set([
  "def", "class", "if", "elif", "else", "for", "while", "return", "import",
  "from", "as", "try", "except", "finally", "with", "in", "not", "and",
  "or", "is", "None", "True", "False", "self", "pass", "break", "continue",
  "yield", "lambda", "raise", "global", "nonlocal", "del", "assert",
]);

const BUILTINS = new Set([
  "print", "len", "range", "int", "str", "float", "bool", "input", "open",
  "sorted", "enumerate", "zip", "list", "dict", "set", "tuple", "type",
  "isinstance", "super", "map", "filter", "round", "abs", "sum", "max",
  "min", "json", "requests", "sqlite3", "random", "datetime",
]);

// Order matters: comments and strings must be matched before keywords,
// so a keyword-looking word inside a string or comment isn't recolored.
const TOKEN_PATTERN =
  /(#[^\n]*)|('''[\s\S]*?'''|"""[\s\S]*?"""|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")|(\b\d+\.?\d*\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

interface Token {
  text: string;
  kind: "comment" | "string" | "number" | "keyword" | "builtin" | "plain";
}
export type { Token };

export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: code.slice(lastIndex, match.index), kind: "plain" });
    }

    const [full, comment, string, number, word] = match;
    if (comment) tokens.push({ text: full, kind: "comment" });
    else if (string) tokens.push({ text: full, kind: "string" });
    else if (number) tokens.push({ text: full, kind: "number" });
    else if (word && KEYWORDS.has(word)) tokens.push({ text: full, kind: "keyword" });
    else if (word && BUILTINS.has(word)) tokens.push({ text: full, kind: "builtin" });
    else tokens.push({ text: full, kind: "plain" });

    lastIndex = match.index + full.length;
  }
  if (lastIndex < code.length) {
    tokens.push({ text: code.slice(lastIndex), kind: "plain" });
  }
  return tokens;
}

const TOKEN_STYLES: Record<Token["kind"], string> = {
  comment: "text-[var(--bm-text3)] italic",
  string: "text-[var(--bm-green)]",
  number: "text-[var(--bm-blue)]",
  keyword: "text-[var(--bm-accent)] font-medium",
  builtin: "text-[var(--bm-blue)]",
  plain: "text-[var(--bm-text2)]",
};

export function PythonCode({ code, caption }: { code: string; caption?: string }) {
  const tokens = tokenize(code);

  return (
    <div className="rounded-md bg-[var(--bm-bg)] border border-[var(--bm-border)] overflow-hidden">
      {caption && (
        <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--bm-text3)] px-3 py-2 border-b border-[var(--bm-border)]">
          {caption}
        </p>
      )}
      <pre className="text-xs font-mono px-3 py-3 overflow-x-auto leading-relaxed">
        <code>
          {tokens.map((t, i) => (
            <span key={i} className={TOKEN_STYLES[t.kind]}>
              {t.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
