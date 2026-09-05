---
title: Taskset CLI is now on npm
description: The first public Taskset release brings the Git-native task workflow to the npm registry.
date: 2026-06-12
author: junkieshuffle
---

On June 12, 2026, we published the first public release of
[`@taskset/cli`](https://www.npmjs.com/package/@taskset/cli) to npm.

Version `0.1.2` is an early release, but it establishes the complete path from
the npm registry to a repository-local Taskset workflow. The CLI and its
runtime dependency chain are now installable under the `@taskset` scope.

## Install the CLI

Taskset currently requires Node.js 24.16.0 or newer. Add the CLI to the project
where you want to manage work:

```bash
pnpm add --save-dev @taskset/cli
```

Initialize Taskset in the repository:

```bash
pnpm taskset init
```

This creates the repository configuration and the `.taskset/` directory where
project work lives as human-readable Markdown.

## Create and inspect work

The first release supports the core local workflow:

```bash
pnpm taskset config --json
pnpm taskset task create --title "Ship the next Taskset feature"
pnpm taskset task list
pnpm taskset task show <task-id>
```

Task files stay beside the code. Git handles history, branches, review, and
collaboration. Taskset provides validation and one consistent model for humans,
automation, and future interfaces.

## Why this release matters

Publishing the CLI is the first distribution milestone for Taskset. A team can
now install the same executable in a project, commit its task data, and share
that workflow without depending on a hosted service or a hidden database.

The package is intentionally pre-alpha. The immediate work is to strengthen
the task lifecycle, graph behavior, search, and the interfaces built on the
same core contracts.

This is the first npm release, not the finished product. It is the point where
Taskset becomes something another repository can install and use.
