---
title: Contributing
description: Repository setup, Taskset dogfooding, pull requests, and completion rules.
---

# Contributing

Taskset is pre-alpha. Strengthen the core file format and workflow before
expanding the number of interfaces.

## Start Here

Read `AGENTS.md`, `skills/standards/SKILL.md`, the product vision, the
architecture overview, and the technology preferences before changing the
repository. Discuss persisted formats, package boundaries, public commands,
synchronization, or snapshots before implementation.

## Setup

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm taskset task list
```

Use the Node and pnpm versions declared by `.nvmrc` and `packageManager`.

## Develop Taskset With Taskset

The repository dogfoods Taskset. Use the root `taskset.config.ts`, the CLI, and
canonical `.taskset/tasks/` files to plan and inspect work. When the CLI
supports the required operation, update the task through the CLI instead of
editing generated or derived state.

## Engineering Rules

- Keep `.taskset/` Markdown as the persistent source of truth.
- Put shared domain behavior in `@taskset/core`.
- Keep runtime schemas and shared data contracts in `@taskset/contracts`.
- Keep core and future server code as a pragmatic modular monolith.
- Use feature-based architecture in UI and interaction surfaces.
- Add dependencies to the package that imports them.
- Preserve deterministic serialization and human-authored Markdown.
- Prefer test-first work for domain rules, parsers, compatibility changes, transitions,
  and bug fixes.

## Finish The Work

Before declaring a workspace task complete:

1. Run the narrowest relevant test, then the broader checks required by risk.
2. Update the canonical Taskset task through the CLI when supported.
3. Update affected user docs, maintainer docs, tests, and
   `skills/standards/`.
4. Run `pnpm check` and `git diff --check`.
5. Report compatibility consequences, checks, and remaining limitations.

Add a Changeset only when release configuration is active and a versioned
contract changes.
