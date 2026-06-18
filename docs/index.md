---
title: Taskset
description: Offline, inline, AI-friendly project awareness stored beside the code.
---

# Taskset

Taskset is an offline, inline, AI-friendly, human-readable task manager designed
to accelerate software delivery and give development teams immediate awareness
of the work surrounding their code.

Tasks and project knowledge live inside the repository as Markdown. Git supplies
history, branches, review, and collaboration. Taskset supplies a consistent
domain model and interfaces over those files.

Install the command-line package from npm as `@taskset/cli`.

## Core Promise

- Work remains readable without Taskset installed.
- Developers can operate locally without a mandatory service.
- Humans and AI agents inspect the same project context.
- CLI, TUI, MCP, editor, Kanban, and reporting views share one source of truth.
- Monorepo projects and code relationships are first-class.

## Current Status

Taskset is pre-alpha. The CLI supports repository initialization, configuration
inspection, validated task CRUD and lifecycle changes, repository diagnostics,
generated views, snapshots, schema v2 migration, metadata queries, and
file-impact analysis.

## Read Next

- [Getting started](getting-started.md)
- [Configuration](configuration.md)
- [CLI reference](cli-reference.md)
- [Task files](task-files.md)
