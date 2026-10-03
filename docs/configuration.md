---
title: Configure Taskset defaults
description: Optionally add taskset.config.ts to overlay defaults and vocabulary on a `.taskset/` repository.
contentType: How-to
navLabel: Configuration
---

# Configure Taskset defaults

Taskset repositories are identified by a `.taskset/` directory. `taskset.config.ts` is optional. When the file is absent, built-in statuses, priorities, and creation defaults apply.

## When to add a config file

Add `taskset.config.ts` when you need at least one of these:

- A repository `project.name`
- Different task creation defaults
- A reduced or reordered status or priority vocabulary
- Closeout gates for parent/child completion, open concerns, or required lessons
- Taxonomy allowlists for labels, projects, or concern classes
- Extra doctor checks for ownerless concerns or stale research

Create one during init:

```bash
taskset init --config
```

Or author the file beside `.taskset/`:

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
	closeout: {
		enforceChildCompletion: false,
		blockDoneWithOpenConcerns: false,
		requireLessonWhenLabeled: [],
	},
	taxonomy: {
		// omit allowlists for permissive behavior
		mode: 'error',
	},
	doctor: {
		activeConcernRequiresOwner: false,
		// staleResearchDays: 14,
	},
})
```

## Contract

- `project.name` is optional repository metadata
- `tasks.defaults.status`, `priority`, and `labels` are optional creation defaults
- `tasks.statuses` selects and orders the active status vocabulary from Taskset’s canonical values
- `tasks.priorities` selects and orders the active priority vocabulary from Taskset’s canonical values
- `urgent` is the highest supported priority
- `closeout.*` defaults to off / empty so existing repositories keep current done transitions
- `taxonomy.labels`, `projects`, and `concernClasses` are optional allowlists; omit them to stay permissive
- `taxonomy.mode` is `error` or `warn` when an allowlist is configured
- `doctor.activeConcernRequiresOwner` and `doctor.staleResearchDays` add optional diagnostics
- Unknown fields, invalid enum values, empty names, and duplicate default labels or vocabulary values are rejected
- The config file is trusted project TypeScript and may use erasable syntax supported by your Node version

The config identifies behavior. It is not task storage. Canonical task and document state remains under `.taskset/`.

## Discovery

Commands started in nested directories walk upward until they find `.taskset/`. If `taskset.config.ts` exists at that root, Taskset loads and validates it. Otherwise it uses built-in defaults.

Use `taskset config --json` to inspect the discovered root, whether a config file is present, and the resolved defaults.
