# @taskset/core

## 1.2.0

### Minor Changes

- Add duplicate, planning-range, and timestamp-range task filters with documented path composition and grouped impact results.

## 1.1.0

### Minor Changes

- Validate public core inputs consistently and report stable field-level issues through `CoreValidationError`.

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
  - @taskset/contracts@1.0.0
  - @taskset/utils@0.2.0

## 0.2.0

### Minor Changes

- Add validated task lifecycle and deletion commands, deterministic graph and
  query APIs, repository diagnostics, file-impact analysis, disposable indexing,
  and conflict-aware synchronization contracts and orchestration.

### Patch Changes

- Updated dependencies
  - @taskset/contracts@0.2.0

## 0.1.2

### Patch Changes

- Publish the Taskset CLI and its runtime package chain under the `@taskset`
  scope with public npm access and intentional package contents.
- Updated dependencies
  - @taskset/contracts@0.1.2
  - @taskset/utils@0.1.2

## 0.1.1

### Patch Changes

- Changeset initiated
- Updated dependencies
  - @taskset/contracts@0.1.1
  - @taskset/utils@0.1.1
