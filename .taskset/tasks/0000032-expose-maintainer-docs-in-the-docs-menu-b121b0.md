---
id: b121b0
title: Expose maintainer docs in the docs menu
status: todo
priority: medium
order: 50
createdAt: 2026-06-18 17:08 UTC
updatedAt: 2026-06-18 17:29 UTC
labels:
  - docs
  - website
related:
  - "1e2079"
files:
  - docs/_meta.ts
  - docs/maintainers
  - apps/www/src/app/(docs)
---

## Context

Maintainer documentation now has a separate docs route, but it should still be discoverable from the docs menu without merging maintainer content back into the primary usage-docs navigation.

## Acceptance Criteria

- [ ] Add a clear maintainer-docs entry point to the docs menu or equivalent navigation surface.
- [ ] Preserve the audience boundary between usage docs and maintainer docs.
- [ ] Verify links work in local development and static export paths.
- [ ] Keep route metadata and menu labels consistent with the current documentation architecture.

## Planning Note

Define the navigation follow-up only; do not change docs routing in this task definition.
