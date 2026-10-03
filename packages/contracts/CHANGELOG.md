# @taskset/contracts

## 6.0.0

### Major Changes

- 89c31c3: Replace sequential and ULID entity IDs with immutable 5-6 character lowercase hex IDs.
  
  Filenames are now `{sequence}-{slug}-{id}.md`. `taskset sync` and `task migrate-ids` migrate legacy IDs, normalize filenames, repair duplicate sequence prefixes by `createdAt`, and rewrite repository references. Default task and document list sorting uses `createdAt` so creation order remains stable. Agents and commands must cite the short `id`, not the mutable sequence prefix.

## 5.0.0

### Major Changes

- Move disposable metadata indexes beside each entity folder and give documents task-like query and mutation commands.
  
  Generated views now live under `.taskset/tasks/.generated/` and each document-kind `.generated/` directory instead of a global `.taskset/generated/` tree. Documents accept the same metadata, list filters, search, impact, status, update, and delete surface as tasks, with document-specific statuses. Sync refreshes data `.gitignore` patterns and removes the legacy global generated directory.

## 4.0.0

### Major Changes

- 0fb519a: Add canonical stories, flows, decisions, research, and runbooks with typed
  templates and Markdown import support. New tasks use sequential title-derived
  IDs, and `task migrate-ids` atomically converts legacy task files and their
  relationships.
  Add paced batch create/import/update/export manifests with progress and a
  one-command sync that repairs repository-wide references and generated views.

## 3.0.0

### Major Changes

- Remove repository config version fields and stop writing version fields to generated, cached, and snapshot metadata JSON. Config files now export a strict versionless object.

  Generated metadata views now cover every supported task metadata field using field-name directories such as `assignees/`, `projects/`, `files/`, and `dueDate/`; stale generated output remains disposable and rebuildable with `taskset generate`.

## 2.1.0

### Minor Changes

- 042a622: Add optional task `order` metadata for user-controlled sequencing. The CLI can
  set, clear, and sort by order; core queries and generated views sort ordered
  tasks first, place unordered tasks after them, and use task IDs as the
  deterministic tie breaker.

## 2.0.0

### Major Changes

- bc302ef: Remove task metadata schema versions and use one strict versionless task file
  format. Task frontmatter containing the legacy version field is now invalid
  and must be converted by removing that field while preserving the remaining
  metadata and Markdown body. The old `taskset migrate --to 2` command and
  `migrateTasks` core API were removed because there is no longer a versioned
  migration target.

### Minor Changes

- 075d265: Add repository-configured task statuses and enforce enabled status vocabularies across task operations.

## 1.0.0

### Major Changes

- d262acd: Expand canonical task metadata to schema v2, replace `tasks-for-file` with
  unified path and impact queries, add derived relationship projections,
  generated metadata views, snapshots, and explicit migration commands.

  Public CLI and core inputs now use Zod validation. Strict UTC date handling
  moves to the generic `parseDate` and `formatDate` utilities; the old
  task-specific timestamp exports are removed.

### Patch Changes

- Updated dependencies [d262acd]
  - @taskset/utils@0.2.0

## 0.2.0

### Minor Changes

- Add validated task lifecycle and deletion commands, deterministic graph and
  query APIs, repository diagnostics, file-impact analysis, disposable indexing,
  and conflict-aware synchronization contracts and orchestration.

## 0.1.2

### Patch Changes

- Publish the Taskset CLI and its runtime package chain under the `@taskset`
  scope with public npm access and intentional package contents.

## 0.1.1

### Patch Changes

- Changeset initiated
