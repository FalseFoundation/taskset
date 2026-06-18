---
id: TS-01KV42R07VXG7JZG4JPZN6FAFP
title: Move maintainer documentation into a separate docs route
status: done
priority: high
createdAt: 2026-06-14 22:06 UTC
updatedAt: 2026-06-18 16:37 UTC
labels:
  - docs
  - website
  - architecture
files:
  - docs/maintainers
  - apps/www/src/app/(docs)/maintainers
  - apps/www/src/app/(docs)/layout.tsx
  - apps/www/content
  - skills/standards/references/architecture.md
  - skills/standards/references/conventions.md
  - skills/standards/references/workflows.md
---

## Context

Maintainer material is currently nested under the same canonical docs tree and navigation as product usage guidance. Move the maintainer documentation into `apps/www/src/app/(docs)/maintainers` and give it a visibly separate route, navigation, and audience boundary from usage docs.

## Acceptance Criteria

- Maintainer pages live under `apps/www/src/app/(docs)/maintainers` with a clear route and layout boundary from usage documentation.
- Usage docs remain newcomer-focused and do not surface maintainer architecture, contribution, testing, or technology pages in their primary navigation.
- Maintainer content has one canonical source; the move does not leave copied or divergent pages behind.
- Internal links, edit links, metadata, static export, search behavior, and route generation continue to work after the move.
- Documentation ownership rules in repository docs and `skills/standards/` are updated to reflect the new canonical path and workflow.
- Website tests or build validation cover both usage and maintainer routes.

## Planning Note

Do not move files or change routes as part of this planning work.
