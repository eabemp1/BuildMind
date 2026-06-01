/**
 * sanitizeOutput
 * Strips characters that should never appear in rendered AI or API text:
 *  - Unicode directional/invisible controls (U+200B–U+200F, U+202A–U+202F,
 *    U+2060–U+2064, U+FEFF, U+00AD)
 *  - Replacement character U+FFFD
 *  - Raw markdown artefacts that survive into rendered strings:
 *    leading/trailing ``` fences, stray **, __, ##, and lone * or _ when
 *    they wrap the entire string or appear at line boundaries
 *  - Non-printable ASCII control characters (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F)
 *    except 0x09 (tab), 0x0A (newline), 0x0D (carriage return)
 *
 * Safe characters (emojis, accented Latin, CJK, Arabic, Cyrillic, etc.)
 * are preserved. This function is PURE — it never throws.
 */
export function sanitizeOutput(raw: string | null | undefined): string {
  if (!raw) return "";

  let s = raw;

  // 1. Non-printable ASCII controls (keep tab, LF, CR)
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  // 2. Unicode invisible / directional / BOM / soft-hyphen
  s = s.replace(/[\u00AD\u200B-\u200F\u202A-\u202F\u2060-\u2064\uFEFF\uFFFD]/g, "");

  // 3. Strip wrapping markdown code fences (``` or ~~~)
  s = s.replace(/^```[a-z]*\n?/i, "").replace(/\n?```\s*$/i, "");
  s = s.replace(/^~~~[a-z]*\n?/i, "").replace(/\n?~~~\s*$/i, "");

  // 4. Strip stray bold/italic markdown markers at line boundaries
  //    (e.g. a line that is literally "**text**" or "__text__")
  s = s.replace(/^\*{1,3}(.*?)\*{1,3}$/gm, "$1");
  s = s.replace(/^_{1,2}(.*?)_{1,2}$/gm, "$1");

  // 5. Strip leading markdown heading tokens (##, ###, etc.) at line start
  s = s.replace(/^#{1,6}\s+/gm, "");

  // 6. Collapse runs of 3+ blank lines to at most 2
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}
