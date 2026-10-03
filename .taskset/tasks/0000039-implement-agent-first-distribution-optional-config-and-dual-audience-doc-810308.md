---
id: "810308"
title: Implement agent-first distribution, optional config, and dual-audience docs
status: done
priority: high
owner: junkieshuffle
assignees:
  - junkieshuffle
createdAt: 2026-10-03 08:12 UTC
updatedAt: 2026-10-03 08:25 UTC
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
  - AGENTS.md
directories:
  - docs
  - docs/agents
  - skills
  - packages/core/src/config
  - packages/cli
projects:
  - taskset
---

## Context

Decision `12c8f5` (backed by research `db4f18`) makes Taskset an agent-first, polyglot repository tool: optional config, `.taskset/` as the repository marker, package-manager-agnostic global/project usage, and human/agent/maintainer documentation audiences. No legacy compatibility layer is required.

## Work

- [x] Confirm ADR `12c8f5` acceptance and resolve open questions from `db4f18`
- [x] Change repository discovery to prefer `.taskset/` and apply built-in defaults when config is absent
- [x] Update `init` so config creation is opt-in; always create canonical `.taskset/`
- [x] Add focused tests for git-root, package.json-fallback discovery plus no-config operation
- [x] Remaster docs into human usage, `docs/agents/`, and existing maintainers; add `llms.txt`
- [x] Rewrite README, CLI help examples, and `skills/taskset` for package-runner and global invocation
- [x] Document project vs global skill installation paths for agents
- [x] Update `taskset-implement` invariants that previously required `taskset.config.ts` as the marker
- [x] Add Changeset(s) for released contract changes

## Acceptance Criteria

- Commands work in a repository that has `.taskset/` and no config file.
- `init` can create a usable Taskset repository without writing `taskset.config.ts`.
- Docs and skills describe package-manager-agnostic invocation and agent/human doc entrypoints.
- Existing config-bearing repositories keep loading validated config.
- Focused core/CLI tests and `taskset doctor` pass.

## Changeset

- `@taskset/core` major
- `@taskset/cli` major
- Summary: optional config, `.taskset/` discovery, agent-first distribution/docs

## References

- Research: `db4f18`
- Decision: `12c8f5`
- Writing guidelines: https://github.com/vercel-labs/writing-guidelines
