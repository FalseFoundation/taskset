---
title: Keep the whole delivery story beside the code
description: Taskset stores plans, research, decisions, runbooks, and tasks as Markdown in your repository for agents and humans.
contentType: Landing
navLabel: Overview
---

# Keep the whole delivery story beside the code

Taskset is a local-first delivery workspace. You keep stories, research, decisions, flows, runbooks, and executable tasks as Markdown under `.taskset/`, so agents and humans share one reviewable source of truth.

Install the CLI as `@taskset/cli` from npm. Run it with `npx`, `pnpm dlx`, `yarn dlx`, `bunx`, a project dependency, or a global install.

## What belongs in Taskset

- **Plan**: stories and flows that define outcomes and journeys
- **Learn**: research that captures evidence and recommendations
- **Decide**: decisions and ADRs that lock lasting choices
- **Operate**: runbooks that make recovery safe to repeat
- **Deliver**: tasks that carry ownership, status, dependencies, and code impact

Documents preserve memory. Tasks move work. Relationships keep the graph honest.

## What you get

- Project knowledge stays in the repository it describes
- Markdown remains readable without Taskset installed
- Agents and humans inspect the same plans, decisions, and work
- CLI, skills, and future interfaces share one domain model
- Monorepo paths and code relationships are first-class

## What the CLI covers

The CLI initializes repositories, manages optional configuration, creates and queries tasks and documents, runs diagnostics, builds generated views, snapshots state, and syncs the tree after upgrades or repairs.

## Choose your path

- [Start a Taskset repository](getting-started.md)
- [Choose a document type](document-types.md)
- [Understand task files](task-files.md)
- [Configure defaults when you need them](configuration.md)
- [Look up every CLI command](cli-reference.md)
- [Read agent workflows and contracts](agents/index.md)
