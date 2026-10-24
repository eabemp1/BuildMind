/**
 * Usage: npx tsx scripts/recommendation-metrics.ts path/to/buildmind-data-export.json
 * Prints repeat/stall metrics for the Today recommendations in a BuildMind data export (schema 1 or 2).
 * Nothing is uploaded; the file is only read.
 */
import { readFileSync } from "node:fs";
import { computeRecommendationMetrics } from "../lib/recommendationMetrics";

const file = process.argv[2];
if (!file) { console.error("Give the path to an export JSON file."); process.exit(1); }
const data = JSON.parse(readFileSync(file, "utf8"));
const rows = data?.tables?.reflexion_learning_log ?? data?.reflexion_learning_log ?? [];
if (!Array.isArray(rows) || !rows.length) { console.error("No reflexion_learning_log rows in this file."); process.exit(1); }
console.log(JSON.stringify(computeRecommendationMetrics(rows), null, 2));
