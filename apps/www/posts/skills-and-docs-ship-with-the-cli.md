---
title: Offline docs and agent skills now ship inside the CLI
description: Installing @taskset/cli also installs the docs and skills trees for agents and humans working without a network.
date: 2026-10-02
author: junkieshuffle
---

Agents should not invent Taskset workflow from memory. After you install `@taskset/cli`, the package now carries the same docs and skills we maintain in the repository.

On October 2, 2026, the CLI build started copying root `docs/` and `skills/` into the published tarball. Installed projects can load guidance from `node_modules/@taskset/cli/docs` and `node_modules/@taskset/cli/skills` without cloning Taskset itself.

## What lands in the package

- Human usage docs: getting started, configuration, CLI reference, task files, document types
- Agent docs and contracts under `docs/agents/`
- The `taskset` skill for planning, research, decisions, runbooks, and tasks
- Maintainer material for contributors who need architecture context offline

## How agents should load it

Prefer the packaged skill before inventing process:

```bash
npx skills add FalseFoundation/taskset --skill taskset
```

Or open the installed copy directly:

```text
node_modules/@taskset/cli/skills/taskset/SKILL.md
node_modules/@taskset/cli/docs/agents/index.md
```

Through September, the skill also grew sharper operating rules: ownership checks before takeover, mid-work follow-up tasks, document modeling, monorepo decomposition, and Changeset guidance. Those lessons now travel with the CLI.

## Why this matters

Distribution is incomplete if the binary arrives without the operating manual. Shipping docs and skills beside the executable makes Taskset usable for coding agents in any repository that can install an npm package, including projects that never open the website.

See the [agent guide](/docs/agents) for the current contracts.
