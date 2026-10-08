# @taskset/cli

## 6.2.0

### Minor Changes

- f55f465: Make canonical filenames the human-facing relationship format and add staged,
  diagnostic, dry-run, and safe-fix behavior to `taskset sync`.

### Patch Changes

- Updated dependencies [f55f465]
  - @taskset/contracts@6.2.0
  - @taskset/core@6.2.0

## 6.1.0

### Minor Changes

- Add operational memory document kinds (`lesson`, `concern`, `audit`), program rollup, optional closeout gates, and taxonomy allowlists.
  
  Agents can create and query lessons, concerns, and audits under `.taskset/` with the same document command surface as existing kinds. `taskset task program` summarizes parent-task programs. Optional `closeout`, `taxonomy`, and `doctor` config keep defaults compatible with existing repositories. `taskset sync` creates the new directories.

### Patch Changes

- Updated dependencies
  - @taskset/contracts@6.1.0
  - @taskset/core@6.1.0

## 6.0.0

### Major Changes

- Make Taskset agent-first and polyglot-friendly: discover repositories by `.taskset/`, treat `taskset.config.ts` as optional, support package-runner and global installs, and split docs for humans and agents.
- 89c31c3: Replace sequential and ULID entity IDs with immutable 5-6 character lowercase hex IDs.
  
  Filenames are now `{sequence}-{slug}-{id}.md`. `taskset sync` and `task migrate-ids` migrate legacy IDs, normalize filenames, repair duplicate sequence prefixes by `createdAt`, and rewrite repository references. Default task and document list sorting uses `createdAt` so creation order remains stable. Agents and commands must cite the short `id`, not the mutable sequence prefix.

### Patch Changes

- Updated dependencies
- Updated dependencies [89c31c3]
  - @taskset/core@6.0.0
  - @taskset/contracts@6.0.0

## 5.1.0

### Minor Changes

- Ship repository docs and skills in the @taskset/cli npm tarball.
  
  The CLI build copies root `docs/` and `skills/` into the package so installed projects can load offline guidance from `node_modules/@taskset/cli/docs` and `node_modules/@taskset/cli/skills`.

## 5.0.0

### Major Changes

- Move disposable metadata indexes beside each entity folder and give documents task-like query and mutation commands.
  
  Generated views now live under `.taskset/tasks/.generated/` and each document-kind `.generated/` directory instead of a global `.taskset/generated/` tree. Documents accept the same metadata, list filters, search, impact, status, update, and delete surface as tasks, with document-specific statuses. Sync refreshes data `.gitignore` patterns and removes the legacy global generated directory.

### Patch Changes

- Updated dependencies
  - @taskset/contracts@5.0.0
  - @taskset/core@5.0.0

## 4.0.0

### Major Changes

- 0fb519a: Add canonical stories, flows, decisions, research, and runbooks with typed
  templates and Markdown import support. New tasks use sequential title-derived
  IDs, and `task migrate-ids` atomically converts legacy task files and their
  relationships.
  Add paced batch create/import/update/export manifests with progress and a
  one-command sync that repairs repository-wide references and generated views.

### Patch Changes

- Updated dependencies [0fb519a]
  - @taskset/contracts@4.0.0
  - @taskset/core@4.0.0

## 3.0.3

### Patch Changes

- List the exact plural array-clear flags in CLI help and cover them with an end-to-end regression test.

## 3.0.2

### Patch Changes

- Updated dependencies
  - @taskset/core@3.0.2

## 3.0.1

### Patch Changes

- Generated metadata views no longer create redundant ID indexes, group timestamp
  metadata by calendar date, and use readable filenames instead of URL-encoded
  spaces or path separators.
- Updated dependencies
  - @taskset/core@3.0.1

## 3.0.0

### Major Changes

- Remove repository config version fields and stop writing version fields to generated, cached, and snapshot metadata JSON. Config files now export a strict versionless object.

  Generated metadata views now cover every supported task metadata field using field-name directories such as `assignees/`, `projects/`, `files/`, and `dueDate/`; stale generated output remains disposable and rebuildable with `taskset generate`.

### Patch Changes

- Updated dependencies
  - @taskset/contracts@3.0.0
  - @taskset/core@3.0.0

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
  format. Task frontmatter containing the legacy version field is now invalid
  and must be converted by removing that field while preserving the remaining
  metadata and Markdown body. The old `taskset migrate --to 2` command and
  `migrateTasks` core API were removed because there is no longer a versioned
  migration target.

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
