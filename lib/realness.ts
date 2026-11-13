/**
 * lib/realness.ts: does the founder's own text say nothing real happened?
 * Shared by scoring and by the facts ledger so simulated or fictional claims never count as evidence.
 */
/** True when the founder's own words say nothing real happened: simulated or fictional data, or no real contact. */
export function reportsNothingReal(text: string): boolean {
  return /\b(simulat\w*|fictional|fictitious|fake|pretend\w*|hypothetical|test (data|account|run)|dummy|made[-\s]up|no (real|actual) (customer|contact|interview|conversation|reply|replies|response|revenue|user)s?|nothing (real|actual) happened)\b/i.test(text);
}
