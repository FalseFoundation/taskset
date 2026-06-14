---
schemaVersion: 2
id: TS-01KV3GB7VGCKYAB6DT07HJTVT9
title: Document complex runtime APIs and algorithms
status: done
priority: medium
createdAt: 2026-06-14 16:44 UTC
updatedAt: 2026-06-14 17:15 UTC
labels:
  - standards
dependsOn:
  - TS-01KV3GAN9RCARCRR6DHBNE12TG
files:
  - skills/standards
  - packages/core/src
---

## Context

Complex public APIs and non-obvious algorithms need concise guidance without narrating obvious code.

## Acceptance Criteria

- Standards require focused TSDoc for non-obvious public APIs.
- Graph, transaction, synchronization, migration, generation, and validation logic receive short orienting comments where useful.
- Obvious assignments and straightforward control flow remain uncommented.
