---
id: db4f18
type: research
title: Agent-first Taskset distribution and repository discovery
status: accepted
owner: junkieshuffle
createdAt: 2026-10-03 08:12 UTC
updatedAt: 2026-10-03 08:24 UTC
labels:
  - product
  - agents
  - distribution
related:
  - 12c8f5
  - "810308"
files:
  - packages/core/src/config/config.ts
  - docs/configuration.md
  - docs/getting-started.md
  - docs/maintainers/architecture/decisions/0001-documentation-platform.md
  - skills/taskset/SKILL.md
directories:
  - docs
  - skills
projects:
  - taskset
---

# Agent-first Taskset distribution and repository discovery

## Question

Should Taskset reposition from “a TypeScript project tool that requires
`taskset.config.ts`” to an agent-first, package-manager-agnostic repository tool
that works globally or project-scoped in any language repo, with documentation
split for agents and humans?

## Sources

- Current discovery: `packages/core/src/config/config.ts` walks upward for
  exactly `taskset.config.ts` and fails without it.
- Usage docs and README treat `pnpm add --save-dev @taskset/cli` plus
  `taskset.config.ts` as the entrypoint (`docs/getting-started.md`,
  `docs/configuration.md`, `README.md`).
- Product vision already names AI systems as first-class readers of repository
  context (`docs/maintainers/product/vision.md`).
- Docs platform ADR already splits humans vs maintainers
  (`docs/maintainers/architecture/decisions/0001-documentation-platform.md`)
  but not agents vs humans.
- Packaged agent skill embeds `node_modules/@taskset/cli/...` paths and
  `pnpm taskset` as the normal invocation (`skills/taskset/SKILL.md`).
- External patterns:
  - [skills.sh / vercel-labs/skills](https://github.com/vercel-labs/skills):
    `npx` / `pnpm dlx` / `yarn dlx` / `bunx`, project default vs `-g` global.
  - [Vercel agent resources](https://vercel.com/docs/agent-resources) and
    [`/llms.txt`](https://vercel.com/llms.txt): agent indexes, Markdown mirrors,
    human docs remain canonical.
  - Vercel agent-readability guidance: `llms.txt`, `AGENTS.md`, discoverable
    Markdown pages without duplicating a second product truth.

## Findings

### Current coupling is JS/TS-project shaped

1. Repository identity is the TypeScript config file, not `.taskset/`.
2. Getting started assumes a Node package manager and a local devDependency.
3. Skills and docs prefer `pnpm taskset`, which fails for global installs,
   non-pnpm repos, and non-JS trees even when the binary exists.
4. Config is executable trusted TypeScript. That is powerful for JS monorepos
   and hostile for Go, Rust, Python, or JVM repositories that only want
   Markdown task files.

### What already fits an agent-first polyglot model

1. Canonical state is already `.taskset/**/*.md` and remains useful without the
   CLI installed.
2. Skills and `--json` already treat agents as primary operators.
3. Maintainer docs are already separated from usage docs.
4. The CLI binary is already published as `@taskset/cli` with a `taskset` bin;
   package runners can invoke it without a project dependency.

### Distribution lessons from skills.sh

- Prefer zero-install invocation via package runners (`npx @taskset/cli`,
  `pnpm dlx`, `yarn dlx`, `bunx`).
- Support both project-scoped install (committed / shared with the team) and
  global/user-scoped install for agents that work across many repos.
- Keep the skill pack installable into agent skill directories; do not make
  `node_modules` the only offline skill path.

### Documentation lessons from Vercel

- Keep one human-readable docs source.
- Add an agent entry surface: compact index (`llms.txt`), optional full corpus,
  and workflow-oriented agent pages or `AGENTS.md`.
- Do not invent a second product truth for agents; point agents at the same
  contracts with denser command and invariant guidance.
- Current split is human usage vs maintainers. The missing split is human usage
  vs agent operation.

### Root-discovery heuristics

Reliable polyglot signals, strongest first:

1. Existing `.taskset/` directory (Taskset-initialized repository).
2. Optional config beside that root when present.
3. Git toplevel (`git rev-parse --show-toplevel`) for `init` and ambiguous cwd.
4. Explicit workspace/root markers when not in git: `pnpm-workspace.yaml`,
   `lerna.json`, `nx.json`, `go.work`, Cargo workspace, Python uv/poetry
   workspace manifests, and similar.
5. JS-only fallback: walk upward while a parent `package.json` still exists and
   stop at the outermost package/workspace root.
6. Otherwise use the current working directory.

Relying on “no parent `package.json`” alone is insufficient for non-JS repos and
can mis-detect nested package layouts; it should be a fallback, not the primary
rule.

## Recommendation

Accept an ADR that:

1. Positions Taskset as an agent-first repository work tool with human-readable
   Markdown as the shared substrate.
2. Makes `.taskset/` the repository marker; config becomes optional overlay.
3. Supports global and project-scoped CLI usage through package runners and
   ordinary global installs, without requiring a local `package.json` dependency.
4. Remasters docs into human, agent, and maintainer audiences, following the
   Vercel-style agent discovery pattern without abandoning Markdown docs as
   source of truth.
5. Keeps the Node-published CLI as the runtime while treating consumer
   repositories as language-agnostic.

## Open questions

Resolved with ADR acceptance on 2026-10-03:

- Optional config remains TypeScript-only for this change; JSON/YAML can wait
- `taskset init` creates `.taskset/` only; `--config` is opt-in
- Skills remain in the npm tarball and are also installable via `npx skills add`
- Public package name stays `@taskset/cli`; package runners and global installs cover the bin surface
- No legacy discovery compatibility layer is required
