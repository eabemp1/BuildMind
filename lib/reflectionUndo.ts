export const UNDO_WINDOW_MS = 30 * 60_000;

/** A saved reflection can be undone for 30 minutes. */
export function withinUndoWindow(createdAt: string, now = Date.now()): boolean {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && now - t >= 0 && now - t <= UNDO_WINDOW_MS;
}
