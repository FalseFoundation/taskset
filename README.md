# Keep the whole delivery story beside the code

Taskset is the Git-native workspace for how software gets planned, researched, decided, operated, and shipped. You store stories, research, decisions, flows, runbooks, lessons, concerns, audits, and the tasks that execute them as Markdown in the repository. Agents and humans read the same files. Git carries history, branches, and review.

No second project board. No hidden database. The work lives where the code lives.

Documentation: [taskset.false.foundation](https://taskset.false.foundation/)

- Humans: [Getting started](docs/getting-started.md)
- Agents: [Agent guide](docs/agents/index.md)
- Maintainers: [Maintainer docs](docs/maintainers/index.md)

## What you keep in Taskset

| Kind | Use it when you need to |
| --- | --- |
| **Story** | Capture a user outcome and acceptance criteria |
| **Flow** | Describe a journey, variants, and checks |
| **Research** | Record evidence, options, and a recommendation |
| **Decision** | Lock a lasting choice with context and consequences |
| **Runbook** | Make recovery and operations repeatable |
| **Lesson** | Prevent rediscovery of a recurring mistake or correct pattern |
| **Concern** | Track open or residual risk with a review cadence |
| **Audit** | Store structured inventory or spot-check evidence |
| **Task** | Execute scoped work with owners, status, and dependencies |

Tasks move delivery forward. Documents preserve product, engineering, and operational memory. Link them with `--related` so the graph stays reviewable.

## Why teams and agents use it

- Context travels with the repository, not a SaaS tab
- Markdown stays readable in PRs, editors, and diffs without Taskset installed
- Agents plan, research, decide, operate, and track through one CLI and skill surface
- Paths, packages, and impact queries keep work attached to real code
- Any language repository can adopt it; the CLI ships on Node

Canonical state lives under `.taskset/`. Generated views and caches are disposable.

## Install

Run the CLI through a package runner, or install it in the project or globally:

```bash
npx @taskset/cli@latest init
pnpm dlx @taskset/cli init
yarn dlx @taskset/cli init
bunx @taskset/cli init
```

Project install:

```bash
pnpm add --save-dev @taskset/cli
pnpm exec taskset init
```

Global install:

```bash
npm install --global @taskset/cli
taskset init
```

`init` creates `.taskset/` with directories for tasks and every document kind. It does not require `taskset.config.ts`. Add `--config` only when you want an optional TypeScript overlay.

## A first delivery loop

Capture intent, lock a choice, then track the work that implements it:

```bash
taskset document create story --title "Member signs in via SSO"
taskset document create research --title "Compare SSO providers"
taskset document create adr --title "Use OIDC for member SSO" --related your_research_id_here
taskset task create --title "Add SSO callback handler" --related your_decision_id_here --file packages/api/src/auth.ts
taskset task status your_task_id_here doing
taskset doctor
```

Operational memory for agent-heavy repos:

```bash
taskset document create concern --title "Capability must not grant authz" --class authz --related your_task_id_here
taskset document create lesson --title "Capability flags are enablement only" --severity high --related your_task_id_here
taskset task program your_parent_task_id_here --json
```

Use short hex `id` values in commands and `--related`. Filename sequence prefixes are display metadata only. When you write a Markdown hyperlink to a file, use the repository-relative filepath (for example [memory model](docs/memory-model.md)), not a bare hex id.

## Optional configuration

Commands discover the nearest `.taskset/` directory by walking upward. Optional `taskset.config.ts` at that root overlays defaults, closeout gates, and taxonomy:

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
	closeout: {
		enforceChildCompletion: true,
		blockDoneWithOpenConcerns: true,
		requireLessonWhenLabeled: ['requires-lesson'],
	},
	taxonomy: {
		labels: ['security', 'authz', 'requires-lesson'],
		mode: 'error',
	},
})
```

Configuration never relocates canonical `.taskset/` data. See [Configuration](docs/configuration.md).

## What a file looks like

Every entity pairs YAML metadata with a Markdown body. A decision records the choice; a task records the execution:

```markdown
---
id: a1b2c3
type: decision
title: Use OIDC for member SSO
status: accepted
related:
  - b2c3d4
---

## Context

Members need one sign-in path across apps.

## Decision

Use OIDC with the existing identity provider.
```

## Agent workflow

Install the packaged skill into your agent, or load it from the published package:

```bash
npx skills add FalseFoundation/taskset --skill taskset
```

Offline copies ship at `node_modules/@taskset/cli/skills/` after a project install. Prefer `--json` for machine handoffs. See the [agent guide](docs/agents/index.md) and [query recipes](docs/agents/query-recipes.md).

## Next

- [Start a Taskset repository](docs/getting-started.md)
- [Choose a document type](docs/document-types.md)
- [Choose memory layers](docs/memory-model.md)
- [Understand task files](docs/task-files.md)
- [CLI reference](docs/cli-reference.md)
- [Security tracking](docs/security-compliance-tracking.md)
