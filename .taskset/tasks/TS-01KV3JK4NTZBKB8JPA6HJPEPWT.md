---
schemaVersion: 2
id: TS-01KV3JK4NTZBKB8JPA6HJPEPWT
title: Add a complete CLI command reference
status: todo
priority: medium
createdAt: 2026-06-14 17:24 UTC
updatedAt: 2026-06-14 17:24 UTC
labels:
  - docs
  - cli
dependsOn:
  - TS-01KV3JJQV9RNDV02TF93JEPEK5
files:
  - docs
  - docs/_meta.ts
  - README.md
  - packages/cli/README.md
---

# Context

The plan explicitly required updated command references. Existing guides show selected examples, but there is no canonical page documenting the complete CLI surface introduced by schema v2.

# Scope

- Add a user-facing command reference page and register it in the documentation navigation.
- Document every command, positional argument, option, repeatable flag, clear flag, default dry-run behavior, and `--apply` requirement.
- Document human and JSON output shapes, including direct/impacted groups and derived relationship projections.
- Document exit codes 0, 1, and 2 and stderr warning behavior.
- Include compatibility notes for removal of `tasks-for-file` and the schema v2 migration workflow.
- Link the reference from the root and CLI READMEs.

# Acceptance Criteria

- A newcomer can discover every supported CLI operation without reading source.
- Examples use current command names and schema v2 fields.
- Command, flag, output, warning, and exit-code behavior matches tested implementation.
- The documentation site builds successfully.
