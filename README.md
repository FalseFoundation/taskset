# Taskset

Taskset is a local-first work-document manager that stores tasks, user stories,
user flows, decisions, research, and runbooks as human-readable Markdown beside the code.

Tasks remain useful in editors, Git history, pull requests, scripts, and AI
workflows without requiring a hosted project-management database.

> Taskset is pre-alpha. The CLI supports repository initialization, validated
> task CRUD and lifecycle changes, repository diagnostics, queries, and
> file-impact analysis.

Documentation: [taskset.false.foundation](https://taskset.false.foundation/)

## Why Taskset

- Work stays in the repository that it describes.
- Markdown remains readable without Taskset installed.
- Git supplies history, branches, review, and collaboration.
- Humans and AI agents inspect the same source of truth.
- CLI, editor, terminal, web, and automation interfaces can share one domain
  model.

Canonical project state lives under `.taskset/`. Generated views and caches are
disposable and rebuildable.

## Quick Start

Install Taskset in the project that will own the work:

```bash
pnpm add --save-dev @taskset/cli
pnpm taskset init
```

Create and inspect work:

```bash
pnpm taskset task create --title "Add repository validation"
pnpm taskset task list
pnpm taskset task show <task-id>
pnpm taskset task status <task-id> doing
pnpm taskset doctor
```

Initialization creates a root `taskset.config.ts`, the canonical
`.taskset/tasks/`, `stories/`, `flows/`, `decisions/`, `research/`, and
`runbooks/` directories, and `.taskset/.gitignore` rules for disposable
cache, per-entity `.generated/` indexes, and non-authoritative safety snapshots.

## Configuration

```typescript
import { defineConfig } from '@taskset/cli'

export default defineConfig({
	project: {
		name: 'example',
	},
	tasks: {
		defaults: {
			status: 'todo',
			priority: 'medium',
			labels: ['example'],
		},
		priorities: ['low', 'medium', 'high', 'urgent'],
	},
})
```

Commands started in nested directories discover `taskset.config.ts` by walking
upward. Configuration controls validated behavior and defaults; it does not
relocate canonical `.taskset/` data.

## Task Files

Each task combines YAML metadata with a Markdown body:

```markdown
---
id: 0000001-add-repository-validation
title: Add repository validation
status: todo
priority: high
owner: platform
assignees:
  - maintainer
risk: medium
dueDate: 2026-06-30
createdAt: 2026-06-12
updatedAt: 2026-06-12 09:30 UTC
files:
  - packages/core/src/index.ts
directories:
  - packages/core
projects:
  - taskset
---

## Context

Explain why the work exists.
```

Task IDs are immutable seven-digit sequences plus a title slug. Taskset validates metadata,
normalizes serialization, and preserves the human-authored Markdown body.

Create durable supporting documents from built-in templates, or import existing
Markdown such as the files under `docs/adr`, `docs/flows`, or `docs/runbooks`:

```bash
pnpm taskset document create story --title "Member signs in"
pnpm taskset document create adr --title "Use Postgres"
pnpm taskset document import docs/flows/sign-in.md --type flow --move
pnpm taskset document list
```

## Queries And Maintenance

Core owns deterministic graph, filtering, search, indexing, and file-impact
semantics. The CLI exposes scriptable forms:

```bash
pnpm taskset task list --status doing --label core --json
pnpm taskset task list --file packages/core --impact --json
pnpm taskset task list --estimate-min 30 --estimate-max 120 --risk high
pnpm taskset doctor --json
pnpm taskset task update <task-id> --priority urgent
pnpm taskset task delete <task-id> --remove-dependencies --json
pnpm taskset generate
pnpm taskset snapshot create
pnpm taskset task migrate-ids
```

`doctor` scans all task files without modifying them. Deletion is blocked when
other tasks depend on the target unless `--remove-dependencies` is selected to
repair those inbound relationships in the same failure-safe mutation.

Migration and snapshot restore are dry runs unless `--apply` is supplied.
Applying a schema migration first creates an immutable snapshot under
`.taskset/snapshots/`. Generated metadata indexes live beside each entity folder
under `.generated/` (for example `.taskset/tasks/.generated/`), cover supported
non-ID metadata fields, group dates by calendar date, keep generated filenames
readable, and refresh automatically after canonical mutations.

## Documentation

User documentation:

- [Getting started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [CLI reference](docs/cli-reference.md)
- [Task files](docs/task-files.md)
- [Document types and imports](docs/document-types.md)

The website in `apps/www` renders the same `docs/` files with Nextra.

## License

Taskset is available under the [MIT License](LICENSE).

Taskset is a [FalseFoundation](https://github.com/falsefoundation) project,
created by [junkieshuffle](https://github.com/junkieshuffle).
