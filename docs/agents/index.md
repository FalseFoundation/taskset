---
title: Operate Taskset as an agent
description: Plan, research, decide, and track repository work with the Taskset CLI, skill, and JSON contracts.
contentType: How-to
navLabel: For Agents
---

# Operate Taskset as an agent

Use this page when you are an agent operating Taskset in a repository. Humans should start with [Getting started](../getting-started.md). Maintainer architecture lives under [Maintainer docs](../maintainers/index.md).

Taskset is not only a task tracker. You use it to capture plans, research, decisions, flows, runbooks, and the tasks that execute them in one Git-native graph.

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
| Scoped execution with status and owners | `task` |

Link documents and tasks with `--related`. Keep one-off scratch in the task body.

## Core operating rules

- Treat `.taskset/tasks/` and kind-specific document directories as the source of truth
- Mutate through CLI commands when a command exists
- Cite short hex ids such as `a1b2c3`, never filename sequence prefixes
- Prefer `--json` for handoffs
- Create follow-up tasks or checklist subtasks for newly discovered work
- Create research, decision, runbook, story, or flow documents when work produces reusable evidence or lasting choices
- Keep statuses current mid-work

## Command map

| Goal | Command |
| --- | --- |
| Inspect root and defaults | `taskset config --json` |
| Validate repository | `taskset doctor --json` |
| List or search tasks | `taskset task list --search "terms" --json` |
| List or search documents | `taskset document list research --search "terms" --json` |
| Show one entity | `taskset task show your_task_id_here --json` |
| Create executable work | `taskset task create --title "Describe the work"` |
| Create durable memory | `taskset document create research --title "Evaluate options" --related your_task_id_here` |
| Change status | `taskset task status your_task_id_here doing` |
| Impact query | `taskset task list --file path/or/dir --impact --json` |
| Repair and rebuild | `taskset sync --json` |

Full contracts: [CLI reference](../cli-reference.md) and [Agent command contracts](commands.md).

## Workflow checklist

1. Confirm the repository root with `taskset config --json`
2. Search existing tasks and documents before creating duplicates
3. Capture durable evidence or decisions as documents mid-work
4. Create or update tasks for executable delivery
5. Resolve ownership before mutating assigned work
6. Keep statuses current, then re-validate after edits

## Related pages

- [Agent workflows](workflows.md)
- [Agent command contracts](commands.md)
- [Document types](../document-types.md)
- [Task files](../task-files.md)
