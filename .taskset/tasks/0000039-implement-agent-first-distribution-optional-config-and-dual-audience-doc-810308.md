---
id: "810308"
title: Implement agent-first distribution, optional config, and dual-audience docs
status: doing
priority: high
owner: junkieshuffle
assignees:
  - junkieshuffle
createdAt: 2026-10-03 08:12 UTC
updatedAt: 2026-10-03 08:18 UTC
labels:
  - product
  - agents
  - distribution
  - docs
related:
  - db4f18
  - 12c8f5
files:
  - packages/core/src/config/config.ts
  - packages/cli/src/cli.ts
  - docs/configuration.md
  - docs/getting-started.md
  - docs/index.md
  - docs/maintainers/architecture/decisions/0001-documentation-platform.md
  - skills/taskset/SKILL.md
  - README.md
directories:
  - docs
  - skills
  - packages/core/src/config
  - packages/cli
projects:
  - taskset
---

## Context

Decision `12c8f5` (backed by research `db4f18`) proposes making Taskset an
agent-first, polyglot repository tool: optional config, `.taskset/` as the
repository marker, package-manager-agnostic global/project usage, and
human/agent/maintainer documentation audiences.

Do not start implementation until the decision is `accepted`, or until an
explicit instruction overrides that gate.

## Work

- [ ] Confirm ADR `12c8f5` acceptance and resolve open questions from `db4f18`
      (default init without config; optional JSON/YAML config; public package name)
- [ ] Change repository discovery to prefer `.taskset/` and apply built-in defaults
      when config is absent
- [ ] Update `init` so config creation is opt-in; always create canonical `.taskset/`
- [ ] Add focused tests for git-root, workspace-marker, and package.json-fallback
      discovery plus no-config operation
- [ ] Remaster docs into human usage, `docs/agents/`, and existing maintainers;
      add site agent discovery (`llms.txt` or equivalent)
- [ ] Rewrite README, CLI help examples, and `skills/taskset` for `npx` / `pnpm dlx`
      / `yarn dlx` / `bunx` / global `taskset`, not only `pnpm taskset`
- [ ] Document project vs global skill installation paths for agents
- [ ] Update `taskset-implement` invariants that currently require
      `taskset.config.ts` as the repository marker
- [ ] Add Changeset(s) for any released contract changes

## Acceptance Criteria

- Commands work in a repository that has `.taskset/` and no config file.
- `init` can create a usable Taskset repository without writing
  `taskset.config.ts`.
- Docs and skills describe package-manager-agnostic invocation and agent/human
  doc entrypoints.
- Existing config-bearing repositories keep loading validated config.
- Focused core/CLI tests cover the new discovery and defaults behavior.

## Changeset

- Likely `@taskset/core` and `@taskset/cli` minor or major depending on whether
  “config required” was treated as a public contract
- Summary: optional config, `.taskset/` discovery, agent-first distribution/docs

## References

- Research: `db4f18`
- Decision: `12c8f5`
- External patterns: skills.sh global/project scope; Vercel agent docs / `llms.txt`
