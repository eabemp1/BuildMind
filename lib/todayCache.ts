/** Today keeps the day's action in this browser. When the founder picks a different action elsewhere, that copy must go. */
export function dropTodayActionCache(store: Pick<Storage, "length" | "key" | "removeItem">): number {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && k.startsWith("bm_today_action_cache")) keys.push(k); }
  keys.forEach((k) => store.removeItem(k));
  return keys.length;
}
