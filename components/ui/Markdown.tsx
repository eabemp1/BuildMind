"use client";

/**
 * <Markdown>
 *
 * Renders AI-generated markdown (bold, italic, inline code, fenced code
 * blocks, GFM-style tables, bullet/numbered lists, headings, blockquotes)
 * as properly styled JSX instead of flattening it to plain text.
 *
 * This replaces the old pattern of calling sanitizeOutput() on AI text and
 * dropping the result straight into a <p> — that stripped markdown markers
 * (**, `, |, #) without ever rendering the formatting they were describing,
 * which is why bold text, tables, and code came out either mangled or as
 * literal punctuation. Use sanitizeMarkdown() (lib/sanitizeOutput.ts) to
 * clean invisible/control characters first, then pass the result here.
 *
 * Deliberately dependency-free (no react-markdown/remark) — this only needs
 * to handle the small, predictable subset of markdown our AI prompts
 * actually produce, and a hand-rolled parser keeps the bundle light and the
 * output fully themeable via the app's --bm-* CSS variables.
 */

import { Fragment, type ReactNode } from "react";

// ── Inline parsing (bold / italic / inline code) ───────────────────────────

type InlineToken =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string };

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;
  const n = text.length;
  let buf = "";
  const flush = () => {
    if (buf) {
      tokens.push({ type: "text", value: buf });
      buf = "";
    }
  };

  while (i < n) {
    // inline code: `code`
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        tokens.push({ type: "code", value: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // bold: **text** or __text__
    if ((text[i] === "*" && text[i + 1] === "*") || (text[i] === "_" && text[i + 1] === "_")) {
      const marker = text[i] + text[i];
      const end = text.indexOf(marker, i + 2);
      if (end !== -1 && end > i + 2) {
        flush();
        tokens.push({ type: "bold", value: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    // italic: *text* or _text_
    if (text[i] === "*" || text[i] === "_") {
      const marker = text[i];
      const end = text.indexOf(marker, i + 1);
      if (end !== -1 && end > i + 1) {
        flush();
        tokens.push({ type: "italic", value: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return tokens;
}

function renderInline(text: string): ReactNode {
  return parseInline(text).map((tok, idx) => {
    switch (tok.type) {
      case "bold":
        return (
          <strong key={idx} style={{ color: "var(--bm-text)", fontWeight: 700 }}>
            {tok.value}
          </strong>
        );
      case "italic":
        return (
          <em key={idx} style={{ fontStyle: "italic" }}>
            {tok.value}
          </em>
        );
      case "code":
        return (
          <code
            key={idx}
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.9em",
              background: "var(--bm-bg3)",
              border: "1px solid var(--bm-border)",
              borderRadius: 4,
              padding: "1px 5px",
            }}
          >
            {tok.value}
          </code>
        );
      default:
        return <Fragment key={idx}>{tok.value}</Fragment>;
    }
  });
}

// ── Block parsing ───────────────────────────────────────────────────────────

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "p"; text: string }
  | { type: "code"; lang: string; value: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "quote"; text: string };

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.includes("-") || !t.includes("|")) return false;
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(t);
}

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

function parseBlocks(raw: string): Block[] {
  const lines = raw.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    // fenced code block
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: "code", lang, value: codeLines.join("\n") });
      continue;
    }

    // heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // table (current line has |, next line is a separator row)
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const qLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        qLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", text: qLines.join(" ") });
      continue;
    }

    // paragraph — collect contiguous lines until a blank line or new block starts
    const paraLines = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i].trim()) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: paraLines.join(" ") });
  }

  return blocks;
}

// ── Component ────────────────────────────────────────────────────────────

const HEADING_SIZES: Record<number, number> = { 1: 17, 2: 15, 3: 14, 4: 13, 5: 13, 6: 13 };

export function Markdown({
  children,
  className,
  textSize = 13,
}: {
  children: string | null | undefined;
  className?: string;
  /** Base font size (px) for paragraph/list text. */
  textSize?: number;
}) {
  if (!children || !children.trim()) return null;
  const blocks = parseBlocks(children);

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "heading":
            return (
              <div
                key={idx}
                style={{
                  fontSize: HEADING_SIZES[block.level] ?? 13,
                  fontWeight: 700,
                  color: "var(--bm-text)",
                  lineHeight: 1.4,
                }}
              >
                {renderInline(block.text)}
              </div>
            );

          case "p":
            return (
              <p
                key={idx}
                style={{ fontSize: textSize, color: "var(--bm-text2)", lineHeight: 1.65, margin: 0 }}
              >
                {renderInline(block.text)}
              </p>
            );

          case "code":
            return (
              <pre
                key={idx}
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--bm-bg3)",
                  border: "1px solid var(--bm-border)",
                  overflowX: "auto",
                }}
              >
                <code
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 12,
                    color: "var(--bm-text)",
                    whiteSpace: "pre",
                  }}
                >
                  {block.value}
                </code>
              </pre>
            );

          case "ul":
            return (
              <ul key={idx} style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {block.items.map((item, i2) => (
                  <li key={i2} style={{ fontSize: textSize, color: "var(--bm-text2)", lineHeight: 1.6 }}>
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            );

          case "ol":
            return (
              <ol key={idx} style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {block.items.map((item, i2) => (
                  <li key={i2} style={{ fontSize: textSize, color: "var(--bm-text2)", lineHeight: 1.6 }}>
                    {renderInline(item)}
                  </li>
                ))}
              </ol>
            );

          case "quote":
            return (
              <div
                key={idx}
                style={{
                  borderLeft: "2px solid var(--bm-accent)",
                  paddingLeft: 12,
                  fontSize: textSize,
                  color: "var(--bm-text3)",
                  fontStyle: "italic",
                  lineHeight: 1.6,
                }}
              >
                {renderInline(block.text)}
              </div>
            );

          case "table":
            return (
              <div key={idx} style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--bm-border)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: textSize - 1 }}>
                  <thead>
                    <tr style={{ background: "var(--bm-bg3)" }}>
                      {block.header.map((h, hi) => (
                        <th
                          key={hi}
                          style={{
                            textAlign: "left",
                            padding: "8px 10px",
                            fontWeight: 700,
                            color: "var(--bm-text)",
                            borderBottom: "1px solid var(--bm-border)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {renderInline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, ri) => (
                      <tr key={ri} style={{ borderTop: ri > 0 ? "1px solid var(--bm-border)" : undefined }}>
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            style={{
                              padding: "8px 10px",
                              color: "var(--bm-text2)",
                              verticalAlign: "top",
                            }}
                          >
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
    }
