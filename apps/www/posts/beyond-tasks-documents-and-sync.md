---
title: Taskset now keeps the whole delivery story
description: Stories, research, decisions, flows, and runbooks join tasks under .taskset/, with batch workflows and repository sync.
date: 2026-09-29
author: junkieshuffle
---

Tasks were never the whole job. Delivery also needs outcomes, evidence, lasting choices, journeys, and recovery procedures. Taskset now stores that memory beside the code.

On September 29, 2026, typed documents landed in `@taskset/cli`: stories, flows, decisions, research, and runbooks under `.taskset/`. Soon after, those documents gained the same query and mutation surface as tasks, with disposable indexes scoped beside each entity folder.

## What you can capture now

| Kind | Use it for |
| --- | --- |
| Story | User outcomes and acceptance criteria |
| Flow | Journeys, variants, and checks |
| Research | Evidence, options, and recommendations |
| Decision | Lasting choices with context and consequences |
| Runbook | Repeatable recovery and operations |
| Task | Owned execution with status and dependencies |

Documents preserve memory. Tasks move work. Link them with `--related` so the graph stays reviewable in Git.

## Create the loop

```bash
taskset document create story --title "Member signs in via SSO"
taskset document create research --title "Compare SSO providers"
taskset document create adr --title "Use OIDC for member SSO" --related your_research_id_here
taskset task create --title "Add SSO callback handler" --related your_decision_id_here
taskset document list research --json
taskset sync
```

Batch create, import, update, and export jobs land through `taskset document batch`. Repository `sync` rebuilds generated views, refreshes ignore rules, and keeps the tree coherent after upgrades.

## Why this matters

A task tracker forgets why the work exists. A docs wiki forgets what is in flight. Taskset keeps both layers in one Git-native model, so agents and humans inherit plans, decisions, and execution from the same repository.

Read [document types](/docs/document-types) and the [CLI reference](/docs/cli-reference) for the full surface.
