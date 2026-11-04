---
id: e7242c
title: Add a bounded agent context query
status: done
priority: high
owner: junkieshuffle
createdAt: 2026-11-04 13:47 UTC
updatedAt: 2026-11-04 14:08 UTC
labels:
  - taskset
  - core
  - cli
  - ai
related:
  - .taskset/decisions/0000005-keep-agent-context-resolution-in-core-4bed0f.md
files:
  - packages/core/src/agents/agentContext.ts
  - packages/core/src/agents/agentContext.test.ts
  - packages/core/src/agents/agentContext.performance.test.ts
  - packages/core/src/index.ts
  - packages/core/README.md
  - packages/cli/src/cli.ts
  - packages/cli/src/cli.test.ts
  - packages/cli/README.md
  - packages/mcp/src/agentTools.ts
  - packages/mcp/src/agentTools.test.ts
  - packages/mcp/src/index.ts
  - packages/mcp/package.json
  - packages/mcp/tsconfig.json
  - packages/mcp/README.md
  - docs/cli-reference.md
  - docs/agents/query-recipes.md
  - docs/agents/workflows.md
  - skills/taskset/SKILL.md
  - skills/taskset-implement/SKILL.md
  - skills/taskset-implement/references/conventions/interfaces-and-ui.md
  - .changeset/calm-agents-query.md
  - pnpm-lock.yaml
---

## Outcome

Provide one compact, bounded, read-only context query shared by core, CLI, and a transport-neutral MCP adapter.

## Checklist

- [x] Add failing core seam tests and implement context resolution
- [x] Add failing CLI seam tests and implement `taskset agent context`
- [x] Add failing adapter seam tests and implement validated tool parity
- [x] Add bounded large-fixture instrumentation and performance measurements
- [x] Update public docs, agent guidance, package metadata, and Changesets
- [x] Run focused and repository-wide validation

## Acceptance Criteria

- One core implementation serves CLI and adapter surfaces.
- Output is compact, bounded, deterministic, local, offline, and read-only.
- Context includes ownership gate, blockers, program health, documents, scopes, closeout readiness, and truncation warnings.
- Existing commands and canonical Markdown storage remain compatible.
- Repository content remains generic and contains no consumer-specific policy.

## Performance

The large fixture contained 1,100 tasks and 1,100 documents. A bounded context query completed in 879.22 ms on 2026-11-04. The performance test ceiling is 10,000 ms.

## Validation

- Core package: 20 files and 95 tests passed.
- CLI package: 18 tests passed.
- MCP adapter package: 2 tests passed.
- Root test suite and integration tests passed.
- Core, CLI, and MCP package builds passed.
- Documentation website production build passed with 35 static pages.
- Biome checked 124 files with no errors.
- `git diff --check` passed.
- Changeset status reports minor bumps for `@taskset/core` and `@taskset/cli`.
- Dogfooding `taskset agent context e7242c --json` returned an allowed execution gate with no warnings.
- The prohibited-name repository scan returned no matches.

## Changeset

- `@taskset/core`: minor, add the public context resolver.
- `@taskset/cli`: minor, add the agent context command.
- `@taskset/mcp`: private; no release entry until published.
