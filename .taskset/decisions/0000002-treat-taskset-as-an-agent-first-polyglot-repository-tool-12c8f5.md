---
id: 12c8f5
type: decision
title: Treat Taskset as an agent-first polyglot repository tool
status: accepted
owner: junkieshuffle
createdAt: 2026-10-03 08:12 UTC
updatedAt: 2026-10-03 08:18 UTC
labels:
  - product
  - agents
  - distribution
  - docs
related:
  - .taskset/research/0000001-agent-first-taskset-distribution-and-repository-discovery-db4f18.md
  - .taskset/tasks/0000039-implement-agent-first-distribution-optional-config-and-dual-audience-doc-810308.md
files:
  - packages/core/src/config/config.ts
  - docs/configuration.md
  - docs/getting-started.md
  - docs/index.md
  - docs/maintainers/architecture/decisions/0001-documentation-platform.md
  - skills/taskset/SKILL.md
directories:
  - docs
  - skills
  - packages/cli
projects:
  - taskset
---

# Treat Taskset as an agent-first polyglot repository tool

## Context

Taskset already stores work as Git-native Markdown under `.taskset/` and ships an
agent skill, but product entrypoints still present it as a typical TypeScript
repository tool:

- discovery requires `taskset.config.ts`
- getting started assumes a local `pnpm`/`npm` project dependency
- docs and skills privilege `pnpm taskset` and `node_modules` paths
- non-JS repositories cannot adopt Taskset without inventing a JS config surface

The intended product shape is closer to an agent operating system for repository
work: reusable across package managers and languages, runnable globally or
project-scoped, with documentation that agents can load without wading through
human onboarding prose. Research `db4f18` captures the evidence and external
patterns (skills.sh distribution; Vercel agent/human docs).

This decision is proposed (`ready`) pending maintainer acceptance.

## Decision

### 1. Product posture

Taskset is primarily an **agent tool** that keeps human-readable repository
state. Humans remain first-class readers and reviewers of `.taskset/` Markdown;
agents are the primary operators of the CLI, skills, and machine interfaces.

Implication: distribution, discovery, defaults, docs navigation, and skill
packaging optimize for agent reuse first, not for resembling a conventional
TypeScript lint/format CLI.

### 2. Repository marker and optional config

- Canonical repository marker is the `.taskset/` data directory.
- `taskset.config.*` is an **optional** behavior overlay for defaults and
  vocabulary. It must not be required to discover, read, or mutate tasks.
- Built-in defaults apply when no config exists.
- When a config file exists, it continues to validate statuses, priorities, and
  creation defaults. It still never relocates canonical storage.

Discovery order:

1. Walk upward for `.taskset/`; that parent directory is the repository root.
2. If an optional config is present at that root, load it; otherwise use defaults.
3. For `init` when `.taskset/` is absent, choose a root by:
   1. Git toplevel when available
   2. Known workspace/root markers across ecosystems
   3. JS fallback: outermost meaningful `package.json` / workspace root
   4. Current working directory
4. Preserve `--cwd` and explicit root overrides for automation.

`taskset init` creates `.taskset/` (and ignore rules) by default. Creating a
config file becomes opt-in, not the identity of a Taskset repository.

### 3. Global and project-scoped distribution

Support both scopes, package-manager agnostically:

| Scope | Typical use | Invocation examples |
| --- | --- | --- |
| Project | team-shared pin in a repo | local dependency + `taskset`, or project package-runner scripts |
| Global / ephemeral | agent laptop, polyglot repos, one-off use | `npx @taskset/cli`, `pnpm dlx @taskset/cli`, `yarn dlx @taskset/cli`, `bunx @taskset/cli`, or a globally installed `taskset` |

Rules:

- Docs and skills must show package-runner and global forms, not only `pnpm taskset`.
- A consumer repository must not need a JavaScript toolchain beyond whatever is
  required to run the published Node CLI binary.
- Ship and document the agent skill so it can be installed into project or
  user agent skill directories (skills.sh-style), not only read from
  `node_modules/@taskset/cli/skills`.
- The CLI runtime remains Node-published; consumer repositories may be any
  language.

### 4. Dual-audience documentation

Extend the documentation platform beyond “usage vs maintainers” to three
audiences:

| Audience | Home | Purpose |
| --- | --- | --- |
| Humans | `docs/` usage pages | concepts, getting started, configuration, readable CLI overview |
| Agents | `docs/agents/` plus packaged `skills/` | command contracts, invariants, workflows, discovery indexes |
| Maintainers | `docs/maintainers/` | architecture, engineering, historical ADRs |

Follow the Vercel-style agent discovery pattern without a second product truth:

- Add an agent index analogous to `llms.txt` on the docs site.
- Prefer Markdown pages and skill references agents can fetch or load offline.
- Keep human pages concise; move dense operational contracts into agent docs and
  skills.
- Update ADR 0001’s audience model during implementation; do not leave agent
  docs as an afterthought inside human getting-started pages.

### 5. Genericity boundary

Become more generic about **repository shape**, not about Taskset’s domain:

- generic: root detection, install scope, package manager, language of the
  consumer repo, optional config
- not generic: abandon `.taskset/`, invent a hosted DB, or weaken Git-native
  Markdown authority

## Alternatives

1. **Keep required `taskset.config.ts`**
   Pros: explicit root, typed defaults, current code path.
   Cons: blocks polyglot adoption; teaches agents that Taskset is a JS-only tool.

2. **Require config but allow JSON/YAML**
   Pros: polyglot-friendly config syntax.
   Cons: still forces a config file when defaults would suffice; discovery remains
   config-centric rather than data-centric.

3. **Agent-only docs rewrite without distribution/discovery changes**
   Pros: smaller docs-only change.
   Cons: leaves the product still gated on JS project conventions.

4. **Rewrite the CLI outside Node**
   Pros: language-native binaries.
   Cons: out of scope; Node distribution already supports polyglot *repositories*
   when config and install assumptions are fixed.

## Consequences

- `discoverRepository` and `init` contracts change; tests, doctor, docs, README,
  and skills must move together.
- Existing repositories with `taskset.config.ts` keep working; config becomes
  optional enhancement rather than the root marker.
- Breaking or major-release communication is needed where tooling assumed
  “no config means no repository.”
- Optional config format follow-up: either keep TypeScript for JS repos only, or
  add a declarative JSON/YAML config in the implementation task. The decision
  here is that config is optional, not that TypeScript config is banned.
- Documentation IA and the website navigation gain an Agents section; maintainer
  docs remain separate.
- Skills become a primary distribution artifact for agents, alongside the CLI.

## Migration

1. Accept this decision (move status to `accepted`) or revise open questions in
   research `db4f18`.
2. Implement via task `810308`: discovery/defaults, init behavior, invocation
   docs, agent docs IA, skill install guidance.
3. Dogfood in this repository: keep or drop `taskset.config.ts` deliberately
   after defaults cover current vocabulary needs.
4. Publish with release notes that say Taskset is usable without a config file
   and without a local JS dependency.

## Status

Accepted on 2026-10-03. Implementation tracked by task `810308`. No legacy
compatibility layer is required for the discovery and init contract change.
