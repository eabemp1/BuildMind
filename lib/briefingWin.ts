/**
 * lib/briefingWin.ts: a WIN in the morning briefing is something the founder reported finishing, nothing else.
 * A product description, a stress-test result or a model's guess is not a completed action, so it can never be a win.
 */
export const NO_WIN = "No wins logged yet.";

export function winFrom(task: string | null | undefined, completed: boolean | undefined): string {
  const t = (task ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
  return completed === true && t ? `You finished: ${t}` : "";
}
