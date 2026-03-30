# Risks and Mitigations (MVP)

## Identity spoofing risk
- Risk: requester is a plain string.
- Mitigation: keep local/demo only; Phase 2 adds auth + signed identity.

## Data mixing risk
- Risk: monolith and file-based state can cross-contaminate.
- Mitigation: scoped personal token keys + planned per-user partition in Phase 2.

## Reliability risk
- Risk: large monolith complexity.
- Mitigation: add tests, structured logs, and controlled demo seed data.

## Privacy risk
- Risk: accidental personal leakage to global model.
- Mitigation: anonymized events only + per-actor privacy toggle.

## Scale risk
- Risk: JSON-file storage not internet-scale.
- Mitigation: phase migration to DB + worker queues + observability stack.
