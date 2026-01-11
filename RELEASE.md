# Release Guide

This repo treats `/openapi.json` as the contract source of truth, and the SDK is generated from it.

## Release checklist

1. Export OpenAPI and verify it is committed.
   ```bash
   npm run openapi:export
   npm run openapi:check
   ```
2. Regenerate and build the SDK.
   ```bash
   npm --workspace packages/sdk run gen
   npm --workspace packages/sdk run build
   ```
3. Run tests.
   ```bash
   npm test
   ```
4. Update versions:
   - Root `package.json` version.
   - `packages/sdk/package.json` version.
   - `src/server/app.ts` OpenAPI version.
5. Update `CHANGELOG.md` with the new version section.
6. Commit changes and tag the release.
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
7. GitHub Actions will:
   - Validate OpenAPI + SDK generation
   - Create a GitHub Release
   - Publish `@worldfork/sdk` if `NPM_TOKEN` is set

## Versioning policy

- Repository tag: `vX.Y.Z`
- `@worldfork/sdk` version matches the tag
- Breaking changes require a new major version or `/v2` routes
