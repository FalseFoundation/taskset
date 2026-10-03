---
title: Cite work by short hex ids, not filename numbers
description: Taskset entity identity is now an immutable 5 to 6 character hex id, while filenames keep a separate display sequence and slug.
date: 2026-10-03
author: junkieshuffle
---

Identity and display order are different problems. Taskset used to fold them together. That made merges brittle and taught agents to cite unstable prefixes.

On October 3, 2026, entity `id` values became immutable 5 to 6 character lowercase hex strings such as `a1b2c3`. Filenames are now `{sequence}-{slug}-{id}.md`. The sequence is maintenance metadata. The hex id never changes after allocation.

## What changed

- Frontmatter `id` is the only durable identity
- Filenames stay readable with a sequence and title slug
- `taskset sync` and `task migrate-ids` migrate legacy ULID and sequential ids
- Duplicate sequence prefixes repair by earliest `createdAt`
- Repository text references rewrite atomically during migration
- Default list sorting uses `createdAt`, because random hex ids are not chronological

## How to talk about work

```bash
taskset task show a1b2c3 --json
taskset document show b2c3d4 --type research --json
taskset task update a1b2c3 --related b2c3d4
```

Cite the short `id` in commands, frontmatter relationships, JSON handoffs, and inline mentions. Do not cite `0000001` from the filename as identity—that prefix is display metadata and can change when sync repairs collisions. When you need a clickable Markdown link to the file itself, use the repository-relative filepath (for example `.taskset/tasks/0000001-add-validation-a1b2c3.md`), not a bare hex id as the link target.

## Upgrade path

Run sync in repositories that still use legacy ids:

```bash
taskset sync --json
```

This is a breaking persisted-format change across `@taskset/contracts`, `@taskset/core`, and `@taskset/cli`. After migration, agents and humans share one short, typeable handle for every task and document.
