---
title: Follow agent workflows in Taskset
description: Ownership checks, mid-work updates, documents, and monorepo habits for agent operators.
contentType: How-to
navLabel: Agent Workflows
---

# Follow agent workflows in Taskset

These workflows assume the CLI is available and `.taskset/` already exists. Initialize with `taskset init` when it does not. Use documents for durable memory and tasks for execution; link them so later agents inherit the full story.

## Before you execute a task

1. Run `taskset task show your_task_id_here --json`
2. Resolve `git config --get user.name`
3. Compare owner and assignees with that identity
4. Pause for confirmation when another person owns or is exclusively assigned the task
5. Check unresolved dependencies and blockers before status changes

Matching ownership does not override blockers. A generic instruction such as “work on the next task” does not override another person’s assignment.

## While you execute

- Set the active task to `doing` when work starts
- Create child tasks (`--parent`) or checklist items (`- [ ]`) for newly discovered work
- Check off finished checklist items as `- [x]`
- Mark finished child tasks `done`
- Create research, decision, runbook, story, or flow documents when evidence or lasting choices appear
- Link documents and tasks with `--related`
- Update a primary skill when the session designates one and a lasting lesson emerges

Do not leave discovered work only in chat.

## Close-out

1. Confirm acceptance criteria are met
2. Confirm every tracked subtask is finished or intentionally resolved
3. Set the parent task to `done`
4. Run the repository’s relevant tests or `taskset doctor --json` when the change touched contracts or many files

## Monorepo habits

- Prefer declared package names and existing Taskset projects over directory-name guesses
- Record `--depends-on` only for real execution prerequisites
- Attach the narrowest accurate `--file` or `--directory` scopes
- Validate the changed package and affected dependents

## Batch and sync

Use `taskset document batch manifest.json --json` for multi-document jobs. Use `taskset sync --json` after upgrades or when filenames, ids, or generated views need repair.
