/**
 * lib/pace.ts — an honest pace forecast for the 90-day goal. Pure.
 * It only speaks once there are at least 3 days of progress to extrapolate from, and it says "if you keep this pace".
 */
export interface PaceInput { current: number; target: number; daysIn: number; daysLeft: number }
export interface Pace { projected: number; onTrack: boolean; perWeek: number }

export function paceForecast(i: PaceInput): Pace | null {
  if (!(i.target > 0) || !(i.daysIn >= 3) || !(i.current > 0) || i.daysLeft < 0) return null;
  const perDay = i.current / i.daysIn;
  const projected = Math.round(perDay * (i.daysIn + i.daysLeft));
  return { projected, onTrack: projected >= i.target, perWeek: Math.round(perDay * 7 * 10) / 10 };
}
