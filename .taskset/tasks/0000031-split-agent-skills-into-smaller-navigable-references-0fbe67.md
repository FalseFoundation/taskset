---
id: 0fbe67
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
  - skills/taskset-implement/SKILL.md
  - skills/taskset-implement/references/architecture.md
  - skills/taskset-implement/references/architecture/product-and-source.md
  - skills/taskset-implement/references/architecture/ownership-and-dependencies.md
  - skills/taskset-implement/references/architecture/client-and-server.md
  - skills/taskset-implement/references/architecture/storage-and-snapshots.md
  - skills/taskset-implement/references/architecture/documentation-and-generated.md
  - skills/taskset-implement/references/conventions.md
  - skills/taskset-implement/references/conventions/design.md
  - skills/taskset-implement/references/conventions/naming-and-packages.md
  - skills/taskset-implement/references/conventions/typescript-and-exports.md
  - skills/taskset-implement/references/conventions/task-files.md
  - skills/taskset-implement/references/conventions/interfaces-and-ui.md
  - skills/taskset-implement/references/conventions/backend-and-tooling.md
  - skills/taskset-implement/references/conventions/tests-and-docs.md
  - skills/taskset-implement/references/workflows.md
  - skills/taskset-implement/references/workflows/environment-and-pnpm.md
  - skills/taskset-implement/references/workflows/dependencies-and-docs-site.md
  - skills/taskset-implement/references/workflows/validation.md
  - skills/taskset-implement/references/workflows/vitest-and-test-strategy.md
  - skills/taskset-implement/references/workflows/persisted-data-and-git.md
  - AGENTS.md
  - docs/maintainers/development/engineering.md
---

## Context

The `./skills` directory has been chunked into smaller, task-oriented references so agent context loads are smaller and navigation is clearer. `$taskset-implement` remains authoritative while broad references now act as routing maps.

## Acceptance Criteria

- [x] Audit `skills/taskset-implement/SKILL.md` and its references for oversized or mixed-purpose sections.
- [x] Propose a smaller reference structure with clear routing rules for planning, implementation, testing, documentation, release, and architecture work.
- [x] Preserve the existing repository invariants and make sure agents still know which references to load for each task type.
- [x] Update any affected skill links or instructions without introducing duplicate or conflicting standards.
- [x] Validate that the resulting skill files are easier to load selectively and remain consistent with maintainer documentation.

## Implementation Notes

- `architecture.md`, `conventions.md`, and `workflows.md` are now compact routing maps.
- Detailed rules live under matching topic directories, such as `references/architecture/`, `references/conventions/`, and `references/workflows/`.
- `SKILL.md`, `AGENTS.md`, and maintainer engineering guidance now describe the routing-map workflow.
