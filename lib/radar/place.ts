/** Read the founder's saved location for Radar's local fit calculations. */
export function readWhere(): string {
  try {
    return localStorage.getItem("bm_radar_where")?.trim() ?? "";
  } catch {
    return "";
  }
}

