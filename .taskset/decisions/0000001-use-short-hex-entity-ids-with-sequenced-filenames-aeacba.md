---
id: aeacba
type: decision
title: Use short hex entity IDs with sequenced filenames
status: accepted
owner: junkieshuffle
createdAt: 2026-10-03 08:03 UTC
updatedAt: 2026-10-03 08:03 UTC
labels:
  - contracts
  - identifiers
  - breaking
related:
  - 0d4d6e
  - eba9d0
files:
  - packages/contracts/src/entityId.ts
  - packages/core/src/ids/entityId.ts
directories:
  - packages/core/src/ids
projects:
  - taskset
---

## Context

Task and document identity previously used sequential `0000001-title` IDs (after
ULIDs). That made the display sequence part of identity, which is brittle under
branch merges and teaches agents to cite unstable index numbers.

## Decision

Canonical entity `id` values are immutable 5-6 character lowercase hex strings.
Filenames are `{sequence}-{slug}-{id}.md`. The sequence is display/maintenance
metadata only and may be repaired by `taskset sync` when duplicates appear; the
hex `id` never changes after allocation.

## Alternatives

- Keep sequential IDs in frontmatter: memorable, but identity collides across branches and equals the display index.
- ULID-only identity: collision-resistant, but hard to discuss and type.
- Full chronological renumber on sync: would rewrite history that was never broken.

## Consequences

- Agents and commands must cite the short `id`, not the filename sequence.
- `taskset sync` / `task migrate-ids` migrate legacy ULID and sequential IDs, normalize filenames, and repair duplicate sequences by earliest `createdAt`.
- Default list sorting uses `createdAt` because random hex IDs are not chronological.
- This is a breaking persisted-format change requiring a major release.
