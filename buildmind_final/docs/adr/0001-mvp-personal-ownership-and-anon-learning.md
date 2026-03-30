# ADR 0001: Personal Ownership + Anonymized Global Learning

## Status
Accepted

## Context
Lumiere vision requires:
- exclusive per-user personal companion ownership,
- optional anonymized global evolution,
- explicit trade/rent for sharing.

## Decision
- Scope personal tokens by requester identity key (`personal::<actor>`).
- Keep specialist agents tradable/rentable in marketplace mock.
- Emit anonymized global events only (no raw conversation text).
- Gate event contribution by per-actor privacy setting.

## Consequences
- MVP supports strong product narrative for privacy and ownership.
- Full trust boundary still depends on real auth in Phase 2.
- Data artifacts are now ready for later Lumiere-native dataset curation.
