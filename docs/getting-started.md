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
pnpm add --save-dev @falsefoundation/taskset
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
`.taskset/cache/` and `.taskset/generated/` because both are rebuildable.

## Create And Inspect Work

```bash
pnpm exec taskset task create --title "Add repository validation"
pnpm exec taskset task list
pnpm exec taskset task show <task-id>
```

Task files can also be read and reviewed directly without Taskset installed.

## Next

- [Configure task defaults](configuration.md)
- [Understand task files](task-files.md)
