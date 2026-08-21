---
title: Configuration
description: How taskset.config.ts identifies and configures a Taskset repository.
---

# Configuration

Taskset usage begins with `taskset.config.ts` at the repository root. Commands
started in nested packages or directories walk upward until they find this
file.

```typescript
import { defineConfig } from '@taskset/cli'

export default defineConfig({
	project: {
		name: 'taskset',
	},
	tasks: {
		defaults: {
			status: 'todo',
			priority: 'medium',
			labels: ['taskset'],
		},
		statuses: ['todo', 'doing', 'blocked', 'done', 'canceled'],
		priorities: ['low', 'medium', 'high', 'urgent'],
	},
})
```

## Contract

- `project.name` is optional repository metadata.
- `tasks.defaults.status`, `priority`, and `labels` are optional defaults used
  by task creation.
- `tasks.statuses` selects and orders the repository's active status vocabulary
  from Taskset's canonical values. Task creation, updates, lifecycle changes,
  listing, generated views, and diagnostics reject or report task statuses
  outside that list. The default status must be included.
- `tasks.priorities` selects and orders the repository's active priority
  vocabulary from Taskset's canonical values. Task creation rejects a priority
  outside that list, and the default priority must be included.
- `urgent` is the highest supported priority. Taskset does not maintain a
  separate urgency field because two overlapping importance scales make task
  ordering harder to understand and keep consistent.
- Unknown fields, invalid enum values, empty names, and duplicate default
  labels or vocabulary values are rejected.
- The config file is executable trusted project code and may use erasable
  TypeScript syntax supported by the repository's Node version.

The config identifies behavior; it is not task storage. Canonical task state
remains under `.taskset/tasks/`, regardless of configuration.

## Discovery

`taskset init` creates a minimal config when one does not exist and initializes
`.taskset/tasks/`. Other commands require a discoverable config and report an
error when run outside a Taskset repository.

Use `taskset config --json` to inspect the discovered root and resolved
defaults.
