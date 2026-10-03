---
title: Track security and compliance in Taskset
description: Model ADR programs, audits, residual risk, and continuous inventories with concerns, lessons, and program rollups.
contentType: How-to
navLabel: Security Tracking
---

# Track security and compliance in Taskset

Use Taskset’s operational memory kinds for security programs without a second tracker.

## Model

| Artifact | Kind | Role |
| --- | --- | --- |
| Program root | Parent task (optional `program` label/project) | Rollup + closeout owner |
| Workstreams | Child tasks | Independently trackable delivery |
| Design choices | `decision` / `adr` | Lasting accepted choices |
| Spot checks | `audit` | Inventory / matrix pass-fail evidence |
| Residual risk | `concern` | Living open-risk register |
| Recurring failure modes | `lesson` | Prevent rediscovery |

## Create a concern

```bash
taskset document create concern \
  --title "Telegram capability must not grant CASL" \
  --class authz \
  --cadence on-release \
  --label security \
  --directory apps/bot \
  --related <task-id> \
  --json
```

Concern statuses:

- open work → `draft` / `ready` / `active`
- mitigated or formally accepted → `accepted`
- replaced → `superseded`
- retired → `archived`

## Create a lesson

```bash
taskset document create lesson \
  --title "Capability flags are enablement only" \
  --severity high \
  --related-skill .agents/skills/security/SKILL.md \
  --pack security \
  --related <concern-or-task-id> \
  --json
```

When `--related-skill` is present, agents should update that skill in the same change. Taskset stores the evidence and pattern; it does not auto-edit the skill.

## Audits

Prefer the `audit` kind for structured inventories:

```bash
taskset document create audit --title "Public route inventory" --related <program-task-id> --json
```

Template covers scope, method, findings (`pass` | `fail` | `residual`), residual items, required follow-ups, and next due date.

## Program health and closeout

```bash
taskset task program <parent-id> --json
taskset doctor --json
```

Optional closeout gates in `taskset.config.ts` (default off):

```typescript
import { defineConfig } from '@taskset/cli'

export default defineConfig({
	closeout: {
		enforceChildCompletion: true,
		blockDoneWithOpenConcerns: true,
		requireLessonWhenLabeled: ['requires-lesson'],
	},
	taxonomy: {
		labels: ['security', 'trust-boundary', 'public-ingress', 'authz', 'concurrency'],
		projects: ['platform', 'bot'],
		concernClasses: ['security', 'privacy', 'authz', 'concurrency', 'ops', 'compliance'],
		mode: 'error',
	},
	doctor: {
		activeConcernRequiresOwner: true,
		staleResearchDays: 14,
	},
})
```

## Example label set

Reuse stable taxonomy instead of inventing labels each task:

- `trust-boundary`
- `public-ingress`
- `authz`
- `concurrency`
- `adr-NNNN` (link-style labels for named ADRs)
- `requires-lesson` (closeout gate trigger when configured)
