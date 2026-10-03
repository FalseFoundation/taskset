---
title: Taskset is stable and ready for every repository
description: The official stable release makes Taskset agent-first, globally installable, config-optional, and usable beyond JavaScript projects.
date: 2026-10-04
author: junkieshuffle
---

Taskset is stable. You can install it globally or in a project, run it through any common package runner, and use it in repositories written in any language. The work still lives as Markdown under `.taskset/`.

This release is the official line for everyday use: agents as primary operators, humans as first-class readers, and no required `taskset.config.ts`.

## Install it your way

```bash
npx @taskset/cli@latest init
pnpm dlx @taskset/cli init
yarn dlx @taskset/cli init
bunx @taskset/cli init
```

Project install:

```bash
pnpm add --save-dev @taskset/cli
pnpm exec taskset init
```

Global install:

```bash
npm install --global @taskset/cli
taskset init
```

`init` creates `.taskset/` with tasks, stories, flows, decisions, research, and runbooks. Pass `--config` only when you want an optional TypeScript overlay.

## What “stable and global” means

- **Repository marker**: the nearest `.taskset/` directory, not a config file
- **Optional config**: built-in defaults when `taskset.config.ts` is absent
- **Polyglot roots**: Git and workspace markers help `init` find the right root
- **Package-manager agnostic**: `npx`, `pnpm dlx`, `yarn dlx`, `bunx`, project bins, and global installs
- **Dual-audience docs**: humans in `docs/`, agents in `docs/agents/` plus `AGENTS.md` and packaged skills
- **Full delivery surface**: plan, research, decide, operate, and track in one graph

## A stable delivery loop

```bash
taskset document create story --title "Member signs in via SSO"
taskset document create research --title "Compare SSO providers"
taskset document create adr --title "Use OIDC for member SSO" --related your_research_id_here
taskset task create --title "Add SSO callback handler" --related your_decision_id_here
taskset doctor --json
```

Cite short hex ids. Prefer `--json` for agent handoffs. Load the skill when you need operating rules:

```bash
npx skills add FalseFoundation/taskset --skill taskset
```

## How we got here

Since the first npm publish, Taskset grew from a local task CLI into a Git-native delivery workspace:

1. Typed documents, batch workflows, and sync
2. Offline docs and skills inside the CLI package
3. Short hex entity ids with sequenced filenames
4. Agent-first discovery, optional config, and dual-audience documentation

Those chapters are the path to this stable line. The contract is deliberate: Markdown remains the source of truth, Git remains the collaboration layer, and agents can operate the same repository humans review.

## Start here

- [Keep the whole delivery story beside the code](/docs)
- [Start a Taskset repository](/docs/getting-started)
- [Operate Taskset as an agent](/docs/agents)
- Package: [`@taskset/cli`](https://www.npmjs.com/package/@taskset/cli)
