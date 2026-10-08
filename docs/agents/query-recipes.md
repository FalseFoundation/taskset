---
title: Query operational memory
description: Copy-paste --json recipes for program blockers and open security concerns.
contentType: Reference
navLabel: Query Recipes
---

# Query operational memory

Prefer `--json` for agent handoffs. Use complete repository-relative canonical
filenames in commands, `--related`, and prose links. Short hex IDs remain
accepted compatibility metadata. Unique basenames and stems are convenient
inputs, but full paths avoid ambiguity (see [commands](commands.md)).

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
taskset document show .taskset/lessons/0000004-capability-flags-a1b2c3.md --json
```

## Audits and research

```bash
taskset document list audit --status ready --json
taskset document list research --status ready --json
```

## Program health

```bash
taskset task program .taskset/tasks/0000001-security-program-c3d4e5.md --json
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
| `missing-template-heading` | document body missing a required `##` section |
| `missing-document-type` | canonical directory can safely supply a missing type |
| `conflicting-document-type` | explicit type disagrees with the canonical directory |
| `invalid-reference-type` | YAML parsed a relationship as a non-string value |
| `missing-reference` | relationship target cannot be resolved |
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
