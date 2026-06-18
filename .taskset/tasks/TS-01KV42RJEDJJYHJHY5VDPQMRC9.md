---
id: TS-01KV42RJEDJJYHJHY5VDPQMRC9
title: Add GitHub and npm icon links to docs and blog
status: todo
priority: medium
order: 40
createdAt: 2026-06-14 22:06 UTC
updatedAt: 2026-06-18 17:29 UTC
labels:
  - website
  - docs
  - accessibility
dependsOn:
  - TS-01KV42R07VXG7JZG4JPZN6FAFP
files:
  - apps/www/src/app/(docs)/layout.tsx
  - apps/www/src/app/(blog)/posts/layout.tsx
  - apps/www/src/shared
  - apps/www/src/mdx-components.tsx
---

## Context

Documentation and blog readers need direct access to the Taskset source repository and published npm package. Add consistent GitHub and npm links with recognizable icons across both content surfaces.

## Acceptance Criteria

- Docs and blog layouts expose links to the canonical Taskset GitHub repository and `@taskset/cli` npm package.
- Links use a shared presentation where appropriate and include recognizable GitHub and npm icons.
- Icon-only controls have accessible names, keyboard focus, sufficient contrast, and appropriate external-link behavior.
- The links remain correct under local development and GitHub Pages base-path static export.
- Responsive layouts avoid duplicated or overflowing navigation on narrow screens.
- Website tests or build validation cover both docs and blog surfaces.

## Planning Note

Do not add components, icons, or layout changes as part of this planning work.
