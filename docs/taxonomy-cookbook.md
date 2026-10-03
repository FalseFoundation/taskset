---
title: Control Taskset taxonomy
description: Allowlists for labels, projects, and concern classes with doctor enforcement.
contentType: How-to
navLabel: Taxonomy Cookbook
---

# Control Taskset taxonomy

Without allowlists, Taskset accepts any trimmed label, project, or concern class from the built-in concern vocabulary. Configure allowlists when discovery drift becomes expensive.

## Config

```typescript
import { defineConfig } from '@taskset/cli'

export default defineConfig({
	taxonomy: {
		labels: [
			'security',
			'trust-boundary',
			'public-ingress',
			'authz',
			'concurrency',
			'requires-lesson',
			'program',
		],
		projects: ['platform', 'bot', 'wallet'],
		concernClasses: ['security', 'privacy', 'authz', 'concurrency', 'ops', 'compliance', 'money'],
		mode: 'error', // or 'warn'
	},
})
```

Rules:

- Empty / omitted allowlists keep permissive behavior.
- `concernClasses` values must be from the canonical set: `security`, `privacy`, `money`, `authz`, `concurrency`, `ops`, `compliance`, `other`.
- `mode: 'error'` rejects create/update mutations with unknown values and fails doctor.
- `mode: 'warn'` allows mutations; doctor reports `unknown-taxonomy` warnings and still exits `0` when no errors exist.

## Example security taxonomy

| Label / class | Use for |
| --- | --- |
| `trust-boundary` | Cross-plane trust assumptions |
| `public-ingress` | Unauthenticated or internet-facing entry |
| `authz` | Authorization grants and checks |
| `concurrency` | Race / idempotency hazards |
| `adr-NNNN` | Work tied to a named ADR |
| `requires-lesson` | Closeout must produce a related `lesson` when closeout config enables it |

## Doctor

```bash
taskset doctor --json
```

Look for `unknown-taxonomy`, `missing-template-heading`, `missing-reference`, `closeout-gap`, `missing-owner`, and `stale-research` diagnostics.
