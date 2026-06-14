---
schemaVersion: 2
id: TS-01KV3GACPZHPXW3BX7B6NECHE2
title: Adopt Zod validation at public boundaries
status: done
priority: high
createdAt: 2026-06-14 16:44 UTC
updatedAt: 2026-06-14 17:15 UTC
labels:
  - validation
  - cli
files:
  - packages/cli/src/cli.ts
  - packages/core/src
---

## Context

Public CLI and core inputs currently mix parser checks with manual validation. Normalize boundary data and validate it through shared Zod schemas.

## Acceptance Criteria

- CLI tokenization remains in `parseArgs`, followed by Zod validation.
- Public core operation and query inputs expose runtime schemas.
- Cross-option errors remain actionable and map to exit code 2.
- Tests cover invalid scalar values and conflicting options.
