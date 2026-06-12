# Taskset

Taskset is a local-first task manager that stores project work as human-readable Markdown beside the code.

Tasks remain useful in editors, Git history, pull requests, scripts, and AI
workflows without requiring a hosted project-management database.

> Taskset is pre-alpha. The CLI currently supports repository initialization,
> configuration inspection, and task creation, listing, and display.

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
pnpm exec taskset init
```

Create and inspect work:

```bash
pnpm exec taskset task create --title "Add repository validation"
pnpm exec taskset task list
pnpm exec taskset task show <task-id>
```

Initialization creates a root `taskset.config.ts`, the canonical
`.taskset/tasks/` directory, and `.taskset/.gitignore` rules for disposable
cache and generated data.

## Configuration

```typescript
import { defineConfig } from '@taskset/cli'

export default defineConfig({
	schemaVersion: 1,
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
schemaVersion: 1
id: TS-01J00000000000000000000000
title: Add repository validation
status: todo
priority: high
createdAt: 2026-06-12
updatedAt: 2026-06-12 09:30 UTC
files:
  - packages/core/src/index.ts
---

## Context

Explain why the work exists.
```

Task IDs are immutable `TS-` prefixed ULIDs. Taskset validates metadata,
normalizes serialization, and preserves the human-authored Markdown body.

## Documentation

User documentation:

- [Getting started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Task files](docs/task-files.md)

The website in `apps/www` renders the same `docs/` files with Nextra.

## License

Taskset is available under the [MIT License](LICENSE).
