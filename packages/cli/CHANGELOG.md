# @taskset/cli

## 2.1.0

### Minor Changes

- 042a622: Add optional task `order` metadata for user-controlled sequencing. The CLI can
  set, clear, and sort by order; core queries and generated views sort ordered
  tasks first, place unordered tasks after them, and use task IDs as the
  deterministic tie breaker.

### Patch Changes

- Updated dependencies [042a622]
  - @taskset/contracts@2.1.0
  - @taskset/core@2.1.0

## 2.0.0

### Major Changes

- bc302ef: Remove task metadata schema versions and use one strict versionless task file
  format. Task frontmatter containing `schemaVersion` is now invalid and must be
  converted by removing that field while preserving the remaining metadata and
  Markdown body. The old `taskset migrate --to 2` command and `migrateTasks`
  core API were removed because there is no longer a versioned migration target.

### Minor Changes

- 075d265: Add repository-configured task statuses and enforce enabled status vocabularies across task operations.

### Patch Changes

- Updated dependencies [075d265]
- Updated dependencies [075d265]
- Updated dependencies [bc302ef]
  - @taskset/contracts@2.0.0
  - @taskset/core@2.0.0

## 1.1.0

### Minor Changes

- Add duplicate, planning-range, and timestamp-range task filters with documented path composition and grouped impact results.

### Patch Changes

- Updated dependencies
  - @taskset/core@1.2.0

## 1.0.1

### Patch Changes

- Updated dependencies
  - @taskset/core@1.1.0

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
  - @taskset/core@1.0.0
  - @taskset/contracts@1.0.0

## 0.2.0

### Minor Changes

- Add validated task lifecycle and deletion commands, deterministic graph and
  query APIs, repository diagnostics, file-impact analysis, disposable indexing,
  and conflict-aware synchronization contracts and orchestration.

### Patch Changes

- Updated dependencies
  - @taskset/contracts@0.2.0
  - @taskset/core@0.2.0

## 0.1.2

### Patch Changes

- Publish the Taskset CLI and its runtime package chain under the `@taskset`
  scope with public npm access and intentional package contents.
- Updated dependencies
  - @taskset/contracts@0.1.2
  - @taskset/core@0.1.2

## 0.1.1

### Patch Changes

- Changeset initiated
- Updated dependencies
  - @taskset/contracts@0.1.1
  - @taskset/core@0.1.1
