---
title: Query operational memory
description: Copy-paste --json recipes for program blockers and open security concerns.
contentType: Reference
navLabel: Query Recipes
---

# Query operational memory

Prefer `--json` for agent handoffs. Use short hex IDs in commands and
`--related`. Filename sequence prefixes are display-only. Markdown hyperlinks
to files must use repository-relative paths (see [commands](commands.md)).

## Open concerns on a path

```bash
taskset document list concern --directory apps/foo --status active --json
taskset document list concern --label security --status active --json
taskset document list concern --class authz --status active --json
```

## Lessons by search or severity

```bash
taskset document list lesson --search "casl capability" --json
taskset document list lesson --severity high --json
taskset document show <lesson-id> --type lesson --json
```

## Audits and research

```bash
taskset document list audit --status ready --json
taskset document list research --status ready --json
```

## Program health

```bash
taskset task program <parent-id> --json
```

Useful fields:

- `children.byStatus` / `children.openIds`
- `blockedDependencies`
- `relatedOpenConcerns`
- `relatedResearchNotAccepted`
- `checklist`
- `closeoutReady`

## Closeout gaps

```bash
taskset doctor --json
```

Interpret:

| Code | Meaning |
| --- | --- |
| `missing-template-heading` | lesson/concern/audit body missing required `##` section |
| `missing-reference` | related/dependsOn target ID does not exist |
| `unknown-taxonomy` | label/project/class outside allowlist |
| `closeout-gap` | done task labeled for lesson without a related lesson |
| `missing-owner` | active concern without owner (when configured) |
| `stale-research` | ready research older than N days without follow-up task |

## Create trail in one change

```bash
taskset document create concern --title "Telegram capability must not grant CASL" --class authz --related <task-id> --json
taskset document create lesson --title "Capability flags are enablement only" --severity high --related <concern-or-task-id> --json
taskset task program <parent-id> --json
taskset doctor --json
```
