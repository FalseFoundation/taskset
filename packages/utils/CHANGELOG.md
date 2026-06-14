# @taskset/utils

## 0.2.0

### Minor Changes

- d262acd: Expand canonical task metadata to schema v2, replace `tasks-for-file` with
  unified path and impact queries, add derived relationship projections,
  generated metadata views, snapshots, and explicit migration commands.

  Public CLI and core inputs now use Zod validation. Strict UTC date handling
  moves to the generic `parseDate` and `formatDate` utilities; the old
  task-specific timestamp exports are removed.

## 0.1.2

### Patch Changes

- Publish the Taskset CLI and its runtime package chain under the `@taskset`
  scope with public npm access and intentional package contents.

## 0.1.1

### Patch Changes

- Changeset initiated
