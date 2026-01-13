# Contract for Integrators

## Stable guarantees
- **OpenAPI is the source of truth.** The contract lives in `openapi/openapi.json` and drives the SDK.
- **List responses are stable.** All list endpoints return `{ items, nextCursor }`.
- **`error.code` is stable.** Codes are never renamed; new codes may be added.
- **Breaking changes:** Introduced via `/v2` routes or a major version bump.

## Update requirements
Any API or core change must also update:
- `openapi/openapi.json`
- `@worldfork/sdk` (generated types + build output)
