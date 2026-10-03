---
title: Start a Taskset repository
description: Install the CLI, initialize `.taskset/`, and capture your first plan, decision, and task in any language repository.
contentType: Tutorial
navLabel: Getting Started
---

# Start a Taskset repository

This guide initializes Taskset in a repository and walks one delivery loop: capture intent, record research or a decision, then track the work. You do not need a JavaScript app, and you do not need `taskset.config.ts`.

## Requirements

- Node.js 24 or newer to run the published CLI
- Any Git repository or project root you can write to

## Install the CLI

Pick one install style:

```bash
npx @taskset/cli@latest --help
```

```bash
pnpm add --save-dev @taskset/cli
```

```bash
npm install --global @taskset/cli
```

The package exposes the `taskset` executable. Package runners work in repositories that never declare a Node dependency.

## Initialize the repository

Run init from the repository root, or from a nested directory when Git or workspace markers identify the root:

```bash
taskset init
```

This creates:

```text
.taskset/
├── .gitignore
├── tasks/
├── stories/
├── flows/
├── decisions/
├── research/
└── runbooks/
```

Add an optional config file only when you need custom task defaults:

```bash
taskset init --config
```

The nested ignore file excludes `.taskset/cache/`, per-entity `.generated/` directories, and `.taskset/snapshots/`. Snapshots are non-authoritative safety checkpoints. Markdown under `.taskset/` remains canonical.

## Capture intent, then track delivery

Start with the durable context, then create the task that implements it:

```bash
taskset document create story --title "Member signs in via SSO"
taskset document create research --title "Compare SSO providers" --related your_story_id_here
taskset document create adr --title "Use OIDC for member SSO" --related your_research_id_here
taskset task create --title "Add SSO callback handler" --related your_decision_id_here --file packages/api/src/auth.ts
taskset task list
taskset document list --json
```

You can read every file directly in the editor without the CLI. Use short hex
`id` values in commands and `--related`. Filename sequence prefixes are display
metadata only. Markdown hyperlinks to entity or docs files must use the
repository-relative filepath (for example [document types](document-types.md)).

## Query and validate the graph

```bash
taskset task list --status doing --label core --json
taskset document list research --search "SSO" --json
taskset task list --file packages/api --impact --json
taskset doctor
```

File and directory filters use repository-relative containment. With `--impact`, list output groups direct matches and work that transitively depends on them. `doctor` reports readable format and graph failures in one non-mutating pass.

## Finish or remove work

```bash
taskset task status your_task_id_here done
taskset document status your_research_id_here accepted --type research
taskset task delete your_task_id_here
```

Completed and canceled tasks are terminal. Deletion fails while another task depends on the target. Use `--remove-dependencies` only when Taskset should remove those inbound references and the task together.

## Next

- [Choose a document type](document-types.md)
- [Choose memory layers](memory-model.md)
- [Understand task files](task-files.md)
- [Configure defaults](configuration.md)
- [Use the complete CLI reference](cli-reference.md)
- [Follow the agent guide](agents/index.md)
- [Query recipes for agents](agents/query-recipes.md)
