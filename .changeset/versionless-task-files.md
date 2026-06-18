---
'@taskset/cli': major
'@taskset/core': major
'@taskset/contracts': major
---

Remove task metadata schema versions and use one strict versionless task file
format. Task frontmatter containing `schemaVersion` is now invalid and must be
converted by removing that field while preserving the remaining metadata and
Markdown body. The old `taskset migrate --to 2` command and `migrateTasks`
core API were removed because there is no longer a versioned migration target.
