# Roadmap

Last updated: 2026-01-13

## 1) Fix OpenAPI vs implementation error code mismatches (P0)
- **Purpose:** Ensure contract accuracy and SDK reliability.
- **DoD:** OpenAPI declares all possible 404 variants; tests assert these error codes.
- **Impact scope:** `src/server/app.ts`, `openapi/openapi.json`.

## 2) Align SDK merge preview/apply behavior (P0)
- **Purpose:** Prevent SDK errors when merge returns 201 on no-conflict apply.
- **DoD:** SDK provides a merge method that handles both 200/201 or a previewOnly option.
- **Impact scope:** `packages/sdk/src/index.ts`, `openapi/openapi.json`.

## 3) Add /health endpoint (P1)
- **Purpose:** Operational readiness and auth whitelist consistency.
- **DoD:** `GET /health` returns 200 with version info; documented in OpenAPI.
- **Impact scope:** `src/server/app.ts`, `openapi/openapi.json`.

## 4) Provide DAG-aware commit history APIs (P1)
- **Purpose:** Support lineage/attribution views beyond first-parent history.
- **DoD:** New endpoint or mode returns DAG relationships with paging.
- **Impact scope:** `src/repo/commitRepo.ts`, `src/server/app.ts`, `openapi/openapi.json`.

## 5) Extend commit/unit metadata (author/module/origin) (P1)
- **Purpose:** Enable attribution and lore module provenance.
- **DoD:** New schema fields + migration + API/SDK support.
- **Impact scope:** `prisma/schema.prisma`, `src/server/app.ts`, `packages/sdk/src/index.ts`.

## 6) Add validators framework for world constraints (P2)
- **Purpose:** Provide pre/post-commit validation chain with warnings/errors.
- **DoD:** Pluggable validators block commits on error and return warnings.
- **Impact scope:** `src/server/app.ts`, `src/core/types.ts`.

## 7) Introduce events/webhooks (P2)
- **Purpose:** Notify external systems on commit/merge updates.
- **DoD:** Outbox/event table + webhook dispatch with retries.
- **Impact scope:** `prisma/schema.prisma`, `src/server/app.ts`.

## 8) Optimize snapshot storage (P3)
- **Purpose:** Reduce storage/IO by enabling incremental snapshots or deduplication.
- **DoD:** Implement storage optimization without breaking deterministic diff/merge.
- **Impact scope:** `src/repo/unitRepo.ts`, `src/server/app.ts`, `prisma/schema.prisma`.
