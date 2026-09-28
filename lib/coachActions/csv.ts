/**
 * lib/coachActions/csv.ts — one CSV cell escaper for every coach export.
 *
 * Cells starting with = + - @ (or tab/CR) are executed as formulas by
 * spreadsheet apps. Exported text here is founder- or AI-authored (task
 * titles, action text, notes), so it's neutralized with a leading apostrophe.
 */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCSV = (header: string[], rows: unknown[][]): string =>
  [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
