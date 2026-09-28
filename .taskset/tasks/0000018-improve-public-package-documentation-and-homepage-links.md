---
id: 0000018-improve-public-package-documentation-and-homepage-links
title: Improve public package documentation and homepage links
status: done
priority: medium
createdAt: 2026-06-14 16:44 UTC
updatedAt: 2026-06-14 17:15 UTC
labels:
  - docs
dependsOn:
  - 0000016-generate-disposable-task-metadata-views
  - 0000017-document-complex-runtime-apis-and-algorithms
files:
  - README.md
  - packages/cli/README.md
  - packages/core/README.md
  - packages/contracts/README.md
  - packages/utils/README.md
---

## Context

The public package READMEs need clearer ownership, installation, API examples, compatibility notes, and a consistent documentation entry point.

## Acceptance Criteria

- Root and all public package READMEs include focused usage and ownership guidance.
- Public documentation links to https://taskset.false.foundation/.
- User and maintainer docs reflect schema v2, migration, generated views, and command changes.
- Breaking release metadata summarizes compatibility and migration requirements.
