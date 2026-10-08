---
id: 0d4d6e
title: Adopt short hex entity IDs with sequenced filenames
status: done
priority: urgent
owner: junkieshuffle
assignees:
  - junkieshuffle
createdAt: 2026-10-03 08:03 UTC
updatedAt: 2026-10-03 08:03 UTC
labels:
  - contracts
  - identifiers
  - breaking
related:
  - .taskset/tasks/0000026-design-memorable-collision-resistant-task-ids-eba9d0.md
  - .taskset/decisions/0000001-use-short-hex-entity-ids-with-sequenced-filenames-aeacba.md
files:
  - packages/contracts/src/entityId.ts
  - packages/contracts/src/task.ts
  - packages/contracts/src/document.ts
  - packages/core/src/ids/entityId.ts
  - packages/core/src/tasks/taskRepository.ts
  - packages/core/src/documents/documentRepository.ts
  - packages/core/src/sync/repositorySync.ts
  - packages/core/src/generated/generatedViews.ts
  - packages/cli/src/cli.ts
  - docs/task-files.md
  - docs/document-types.md
  - docs/cli-reference.md
directories:
  - packages/contracts/src
  - packages/core/src/ids
  - skills/taskset
  - skills/taskset-implement
projects:
  - taskset
---

## Context

Sequential `0000001-title` IDs put mutable display ordering into identity, which
collided across branches and forced agents to cite unstable prefixes. Entity
identity is now an immutable short lowercase hex ID, while filenames keep a
separate display sequence and title slug.

## Work

- [x] Define shared 5-6 character hex `EntityIdSchema` with legacy read support
- [x] Allocate short IDs for tasks and documents; write `{sequence}-{slug}-{id}.md`
- [x] Extend `sync` / `migrate-ids` to migrate legacy IDs, normalize filenames, and repair duplicate sequences by `createdAt`
- [x] Point generated-view links at real filenames; default list sort to `createdAt`
- [x] Update docs, agent skills, tests, and a major Changeset
- [x] Migrate this repository's canonical task files and verify `doctor`

## Acceptance Criteria

- Frontmatter `id` is an immutable 5-6 character lowercase hex value.
- Filenames use `{sequence}-{slug}-{id}.md`; agents and CLI cite the short `id`.
- `taskset sync` migrates legacy ULID and sequential IDs and repairs duplicate sequence prefixes by earliest `createdAt`.
- Skills instruct agents to reference short IDs, never filename sequence numbers.
- Focused contracts/core/CLI tests and `taskset doctor` pass after migration.

## Changeset

- `@taskset/contracts` major
- `@taskset/core` major
- `@taskset/cli` major
- Summary: short hex entity IDs, sequenced filenames, sync migration/repair

## References

- Related prior design: `eba9d0` (sequential title-derived IDs)
- `.changeset/short-hex-entity-ids.md`
