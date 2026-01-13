# Audit Docs

- `LATEST.md` is the current, canonical audit report.
- `archive/` stores date-stamped snapshots of prior audits.

## When to update
Update the audit whenever changes touch core implementation, contract, or SDK surfaces, including:
- `src/core/**`
- `src/repo/**`
- `src/server/**`
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `openapi/openapi.json`
- `packages/sdk/**`
- `.github/workflows/**` (contract/release guard changes)

## Update steps
1) Update `docs/audit/LATEST.md` (keep sections A–L) and append a new dated snapshot under `docs/audit/archive/`.
2) If roadmap items changed, update `docs/roadmap.md` and refresh its date.
3) Export OpenAPI/SDK if contract changed, then commit all updates together.

## Guardrail
CI runs `npm run audit:guard` to enforce that audited changes include a refreshed `docs/audit/LATEST.md` (and `docs/roadmap.md` when relevant).
