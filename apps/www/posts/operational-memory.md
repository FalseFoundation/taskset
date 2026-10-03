---
title: Operational memory joins Taskset
description: Lessons, concerns, and audits keep recurring mistakes and residual risk in .taskset/, with program rollups and optional closeout gates.
date: 2026-10-03
author: junkieshuffle
---

Delivery memory was never only tasks. Decision memory was never only ADRs. Agent-heavy monorepos also need a place for recurring mistakes, open residual risk, and program closeout—without inventing a second tracker.

On October 3, 2026, `@taskset/cli` gained operational memory: typed `lesson`, `concern`, and `audit` documents under `.taskset/`, plus `taskset task program` rollups and optional config-driven closeout and taxonomy checks.

## What landed

| Kind | Directory | Use it for |
| --- | --- | --- |
| Lesson (`antipattern`) | `.taskset/lessons/` | Recurring incorrect/correct patterns future agents must not rediscover |
| Concern | `.taskset/concerns/` | Living open or residual risk (security, authz, money, ops, …) |
| Audit | `.taskset/audits/` | Structured spot-checks and inventories with pass/fail/residual findings |

These kinds use the same document command surface as stories, flows, research, decisions, and runbooks: create, list, show, update, status, delete, search, impact, import, and batch. `taskset sync` creates the new directories. Existing repositories keep working with zero config.

## A durable trail in one change

```bash
taskset document create concern \
  --title "Telegram capability must not grant CASL" \
  --class authz \
  --cadence on-release \
  --related a1b2c3 \
  --json

taskset document create lesson \
  --title "Capability flags are enablement only" \
  --severity high \
  --related-skill .agents/skills/security/SKILL.md \
  --related a1b2c3 \
  --json

taskset task program a1b2c3 --json
taskset doctor --json
```

Lessons may point at consumer skills with `--related-skill`. Taskset stores the evidence and pattern. Agents should update that skill in the same change. Taskset does not auto-edit skills.

## Program health without epics

Treat a parent task as the program root. Child tasks carry workstreams. Related concerns and research keep residual risk and evidence visible:

```bash
taskset task program <parent-id> --json
```

The rollup reports child status counts, open children, blocked dependencies, related open concerns, research not yet accepted, checklist completion, and `closeoutReady`.

Optional closeout gates stay off by default:

```typescript
import { defineConfig } from '@taskset/cli'

export default defineConfig({
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

## How to cite work

Use the short hex `id` in commands, `--related`, and JSON handoffs. When you write a Markdown hyperlink to a file—docs, skills, or a `.taskset/` entity—use the repository-relative filepath so the link opens in the editor and on GitHub. Filename sequence prefixes such as `0000001` are display metadata, not identity and not link targets.

## Why this matters

Closed tasks and chat transcripts are where lessons go to die. A security program without an open-risk register keeps rediscovering the same authz mistake. Operational memory keeps that trail queryable beside the code, in the same Git-native store agents already use for delivery and decisions.

On the site, start with [memory model](/docs/memory-model), [document types](/docs/document-types), [security tracking](/docs/security-compliance-tracking), and [agent query recipes](/docs/agents/query-recipes). In the repository those files are [`docs/memory-model.md`](../../docs/memory-model.md), [`docs/document-types.md`](../../docs/document-types.md), [`docs/security-compliance-tracking.md`](../../docs/security-compliance-tracking.md), and [`docs/agents/query-recipes.md`](../../docs/agents/query-recipes.md).
