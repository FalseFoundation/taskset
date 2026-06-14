---
title: Getting Started
description: Initialize Taskset in a project and create the first repository task.
---

# Getting Started

Taskset keeps project work in human-readable Markdown beside the code. The
current pre-alpha release is intended for local repository use.

## Requirements

- Node.js 24 or newer
- pnpm 11 or newer

## Install

Install the published package as a development dependency in the project that
will own the tasks:

```bash
pnpm add --save-dev @taskset/cli
```

The package exposes the `taskset` executable.

## Initialize

Run Taskset from the repository root:

```bash
pnpm exec taskset init
```

This creates:

```text
taskset.config.ts
.taskset/
├── .gitignore
└── tasks/
```

The config controls validated defaults. Task Markdown under `.taskset/tasks/`
remains the canonical project state. The nested ignore file excludes
`.taskset/cache/`, `.taskset/generated/`, and `.taskset/snapshots/`.
Snapshots are non-authoritative safety checkpoints; tasks remain canonical.

## Create And Inspect Work

```bash
pnpm exec taskset task create --title "Add repository validation"
pnpm exec taskset task list
pnpm exec taskset task show <task-id>
pnpm exec taskset task update <task-id> --status doing
```

Task files can also be read and reviewed directly without Taskset installed.

## Query And Validate Work

```bash
pnpm exec taskset task list --status doing --label core --json
pnpm exec taskset task list --file packages/core --impact --json
pnpm exec taskset doctor
```

File and directory filters use normalized repository-relative containment
matching. With `--impact`, list output groups direct matches and tasks that
transitively depend on them. Other filters select the direct set before graph
expansion. `doctor` reports all readable format and graph failures in one
non-mutating pass.

## Generated Views And Migration

```bash
pnpm exec taskset generate
pnpm exec taskset snapshot create
pnpm exec taskset snapshot list
pnpm exec taskset migrate --to 2
pnpm exec taskset migrate --to 2 --apply
```

Migration previews by default. Applying it snapshots canonical tasks first,
then rewrites schema v1 files to v2 atomically. Snapshot restore also previews
unless `--apply` is present.

## Complete Or Remove Work

```bash
pnpm exec taskset task status <task-id> done
pnpm exec taskset task delete <task-id>
```

Completed and canceled tasks are terminal. Deletion fails while another task
depends on the target. Use `--remove-dependencies` only when Taskset should
remove those inbound references and the task together.

## Next

- [Configure task defaults](configuration.md)
- [Understand task files](task-files.md)
