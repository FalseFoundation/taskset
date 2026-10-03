---
'@taskset/contracts': major
'@taskset/core': major
'@taskset/cli': major
---

Replace sequential and ULID entity IDs with immutable 5-6 character lowercase hex IDs.

Filenames are now `{sequence}-{slug}-{id}.md`. `taskset sync` and `task migrate-ids` migrate legacy IDs, normalize filenames, repair duplicate sequence prefixes by `createdAt`, and rewrite repository references. Default task and document list sorting uses `createdAt` so creation order remains stable. Agents and commands must cite the short `id`, not the mutable sequence prefix.
