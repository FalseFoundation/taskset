---
id: TS-01KVDV8X2KEBNTKQFNQ005ZCWQ
title: Split agent skills into smaller navigable references
status: done
priority: high
createdAt: 2026-06-18 17:08 UTC
updatedAt: 2026-06-18 17:18 UTC
labels:
  - docs
  - skills
  - ai
files:
  - skills/standards/SKILL.md
  - skills/standards/references/architecture.md
  - skills/standards/references/architecture/product-and-source.md
  - skills/standards/references/architecture/ownership-and-dependencies.md
  - skills/standards/references/architecture/client-and-server.md
  - skills/standards/references/architecture/storage-and-snapshots.md
  - skills/standards/references/architecture/documentation-and-generated.md
  - skills/standards/references/conventions.md
  - skills/standards/references/conventions/design.md
  - skills/standards/references/conventions/naming-and-packages.md
  - skills/standards/references/conventions/typescript-and-exports.md
  - skills/standards/references/conventions/task-files.md
  - skills/standards/references/conventions/interfaces-and-ui.md
  - skills/standards/references/conventions/backend-and-tooling.md
  - skills/standards/references/conventions/tests-and-docs.md
  - skills/standards/references/workflows.md
  - skills/standards/references/workflows/environment-and-pnpm.md
  - skills/standards/references/workflows/dependencies-and-docs-site.md
  - skills/standards/references/workflows/validation.md
  - skills/standards/references/workflows/vitest-and-test-strategy.md
  - skills/standards/references/workflows/persisted-data-and-git.md
  - AGENTS.md
  - docs/maintainers/development/engineering.md
---

## Context

The `./skills` directory has been chunked into smaller, task-oriented references so agent context loads are smaller and navigation is clearer. `$standards` remains authoritative while broad references now act as routing maps.

## Acceptance Criteria

- [x] Audit `skills/standards/SKILL.md` and its references for oversized or mixed-purpose sections.
- [x] Propose a smaller reference structure with clear routing rules for planning, implementation, testing, documentation, release, and architecture work.
- [x] Preserve the existing repository invariants and make sure agents still know which references to load for each task type.
- [x] Update any affected skill links or instructions without introducing duplicate or conflicting standards.
- [x] Validate that the resulting skill files are easier to load selectively and remain consistent with maintainer documentation.

## Implementation Notes

- `architecture.md`, `conventions.md`, and `workflows.md` are now compact routing maps.
- Detailed rules live under matching topic directories, such as `references/architecture/`, `references/conventions/`, and `references/workflows/`.
- `SKILL.md`, `AGENTS.md`, and maintainer engineering guidance now describe the routing-map workflow.
