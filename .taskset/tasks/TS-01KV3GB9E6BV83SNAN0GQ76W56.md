---
schemaVersion: 2
id: TS-01KV3GB9E6BV83SNAN0GQ76W56
title: Improve public package documentation and homepage links
status: done
priority: medium
createdAt: 2026-06-14 16:44 UTC
updatedAt: 2026-06-14 17:15 UTC
labels:
  - docs
dependsOn:
  - TS-01KV3GAN9RCARCRR6DHBNE12TG
  - TS-01KV3GB7VGCKYAB6DT07HJTVT9
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
