---
title: Operate Taskset as an agent
description: Plan, research, decide, operate, and track repository work with the Taskset CLI, skill, and JSON contracts.
contentType: How-to
navLabel: For Agents
---

# Operate Taskset as an agent

Use this page when you are an agent operating Taskset in a repository. Humans should start with [Getting started](../getting-started.md). Maintainer architecture lives under [Maintainer docs](../maintainers/index.md).

Taskset is not only a task tracker. You use it to capture plans, research, decisions, flows, runbooks, lessons, concerns, audits, and the tasks that execute them in one Git-native graph.

## Load the skill first

Prefer the packaged skill before inventing workflow:

```bash
npx skills add FalseFoundation/taskset --skill taskset
```

Project and global skill installs both work. After a project npm install, offline copies also live at `node_modules/@taskset/cli/skills/taskset/SKILL.md`.

## Invoke the CLI

Do not assume `pnpm taskset`. Use whichever runner the environment provides:

```bash
npx @taskset/cli document list --json
npx @taskset/cli task list --json
pnpm dlx @taskset/cli doctor --json
yarn dlx @taskset/cli document show your_document_id_here --json
bunx @taskset/cli sync --json
taskset task list --json
```

## Discover the repository

1. Walk upward for `.taskset/`
2. Load optional `taskset.config.ts` at that root when present
3. Otherwise use built-in defaults

No config file is required. `taskset init` creates `.taskset/` only. Pass `--config` when the repository wants an optional TypeScript overlay.

## Choose the right artifact

| If the work produces… | Create… |
| --- | --- |
| A user outcome or acceptance criteria | `story` |
| A journey with variants and checks | `flow` |
| Evidence, options, or a recommendation | `research` |
| A lasting architectural or product choice | `decision` / `adr` |
| A repeatable recovery or ops procedure | `runbook` |
| A recurring mistake or correct pattern | `lesson` |
| An open residual risk | `concern` |
| A structured inventory or spot-check | `audit` |
| Scoped execution with status and owners | `task` |
| Multi-task program health | parent task + `taskset task program` |

Link documents and tasks with `--related`. Keep one-off scratch in the task body. See [Memory model](../memory-model.md) for anti-examples.

## Core operating rules

- Treat `.taskset/tasks/` and kind-specific document directories as the source of truth
- Mutate through CLI commands when a command exists
- Use short hex ids such as `a1b2c3` in commands and `--related`. Filename sequence prefixes are display-only.
- Markdown hyperlinks to files must use repository-relative paths (for example [document types](../document-types.md)), not bare hex ids
- Prefer `--json` for handoffs
- Create follow-up tasks or checklist subtasks for newly discovered work
- Create research, decision, runbook, story, flow, lesson, concern, or audit documents when work produces reusable evidence, lasting choices, recurring patterns, or residual risks
- Keep statuses current mid-work

## Command map

| Goal | Command |
| --- | --- |
| Inspect root and defaults | `taskset config --json` |
| Validate repository | `taskset doctor --json` |
| List or search tasks | `taskset task list --search "terms" --json` |
| List or search documents | `taskset document list research --search "terms" --json` |
| Open concerns on a path | `taskset document list concern --directory apps/foo --status active --json` |
| Lessons by search | `taskset document list lesson --search "casl" --json` |
| Show one entity | `taskset task show your_task_id_here --json` |
| Create executable work | `taskset task create --title "Describe the work"` |
| Create durable memory | `taskset document create research --title "Evaluate options" --related your_task_id_here` |
| Create a lesson | `taskset document create lesson --title "…" --severity high --related your_task_id_here` |
| Create a concern | `taskset document create concern --title "…" --class authz --related your_task_id_here` |
| Program health | `taskset task program your_parent_task_id_here --json` |
| Change status | `taskset task status your_task_id_here doing` |
| Impact query | `taskset task list --file path/or/dir --impact --json` |
| Repair and rebuild | `taskset sync --json` |

Full contracts: [CLI reference](../cli-reference.md), [Agent command contracts](commands.md), and [Query recipes](query-recipes.md).

## Workflow checklist

1. Confirm the repository root with `taskset config --json`
2. Search existing tasks and documents before creating duplicates
3. Capture durable evidence, decisions, lessons, or concerns as documents mid-work
4. Create or update tasks for executable delivery
5. Resolve ownership before mutating assigned work
6. Keep statuses current, then re-validate with `taskset doctor --json`

## Related pages

- [Agent workflows](workflows.md)
- [Agent command contracts](commands.md)
- [Query recipes](query-recipes.md)
- [Memory model](../memory-model.md)
- [Agent closeout](../agent-closeout.md)
- [Security tracking](../security-compliance-tracking.md)
- [Document types](../document-types.md)
- [Task files](../task-files.md)
