---
name: standards
description: Repository-specific engineering standards for Taskset. Use when planning, implementing, reviewing, testing, documenting, releasing, or restructuring this repository, especially for the offline Git-native Markdown data model, package ownership, feature-based clients, DDD-lite modular core and server code, pnpm and Turbo workflows, TypeScript conventions, tests, and Changesets.
---

# Taskset Standards

Apply these standards to every Taskset repository task. Treat them as decision
rules, not as a substitute for reading the code involved.

## Skill Resources

Load only the references relevant to the task:

- [architecture.md](references/architecture.md): product vision, source of
  truth, package ownership, dependency flow, client FBA, modular core and server
  code, snapshots, documentation, and storage boundaries
- [conventions.md](references/conventions.md): naming, TypeScript, Markdown
  entities, UI, scripts, tests, and documentation
- [workflows.md](references/workflows.md): environment, pnpm, Turbo, validation,
  and Taskset-specific test strategy
- [release.md](references/release.md): Changesets, compatibility, commit
  language, and completion requirements
- [`docs/maintainers/technology.md`](../../docs/maintainers/technology.md): preferred
  TanStack frontend tools, TypeScript/NestJS and Rust backend choices, and
  MariaDB/PostgreSQL database defaults

`agents/openai.yaml` is discovery and UI metadata. Do not load it as an
instruction reference.

## Start With Judgment

1. Read the complete request before planning or acting. For a multi-part
   request, identify dependencies, contradictions, and shared owners across all
   items before changing any one item.
2. Turn multi-part work into a prioritized checklist. Close every requested
   item as implemented, already satisfied, or intentionally unnecessary with a
   concrete reason; do not silently drop notes or late dependencies.
3. Parse the request into intent, constraints, affected owners, and a concrete
   completion condition.
4. Inspect the worktree, manifests, relevant implementation, tests, and
   executable configuration before proposing or editing.
5. Challenge an approach that creates a second source of truth, bypasses core
   validation, weakens deterministic file behavior, or crosses package
   ownership without a contract.
6. If a requested change appears unreasonable, internally contradictory,
   destructive, or incompatible with established product contracts, explain
   the concrete concern and ask for explicit confirmation before implementing
   it.
7. Recover decisions from the repository before asking questions. Ask only when
   a consequential product or data-format decision remains unresolved.
8. Treat related work as one dependency graph. Keep schemas, core behavior,
   clients, tests, docs, and release metadata consistent.
9. Update this skill and its relevant references in the same change whenever
   authoritative paths, package names, commands, architecture, product
   contracts, documentation workflows, or completion rules change. Never leave
   the skill knowingly stale.

Do not implement a request merely because it was requested. Establish that the
outcome is coherent with Taskset's Git-native contract first.

## Establish Authority

When repository sources disagree, use this order:

1. Current user constraints and the actual task.
2. Executable manifests and tooling: `package.json`, `pnpm-workspace.yaml`,
   `turbo.json`, `tsconfig.json`, and `biome.json`.
3. Current implementation and tests.
4. Current first-party documentation and this skill.
5. Product plans and historical notes for intent only.

The repository is currently an early scaffold. Do not turn accidental manifest
mistakes, empty packages, or placeholder dependencies into conventions. Report
them and follow the intended `@taskset/<directory-name>` ownership model.

## Preserve Product Invariants

Read [architecture.md](references/architecture.md) before changing package
boundaries, entity formats, filesystem behavior, graph semantics, or interface
contracts.

Non-negotiable rules:

- Human-readable files under `.taskset/` are the persistent source of truth.
- Git provides history, transport, branching, and review; hidden databases do
  not become authoritative.
- Generated views, caches, and in-memory indexes are disposable and rebuildable
  from canonical files.
- `@taskset/core` owns domain behavior, parsing orchestration, validation,
  filesystem mutation, indexing, graph rules, search, and lifecycle transitions.
- CLI, TUI, MCP, extension, Kanban, and Office are interfaces over the same core
  contracts. They do not reimplement Taskset semantics.
- `@taskset/contracts` owns shared runtime schemas and TypeScript contracts
  without filesystem, lifecycle, or UI behavior.
- `@taskset/utils` stays domain-light. Task graph policy and entity lifecycle
  logic belong in core.
- External integrations are adapters and synchronized views. They do not become
  the silent source of truth.
- Persisted format changes require explicit compatibility and migration
  decisions.
- Canonical task files use one strict versionless metadata shape. Versioned
  task frontmatter and unknown fields are rejected.
- `taskset.config.ts` marks the repository root and configures validated project
  metadata and task creation defaults. It never relocates canonical
  `.taskset/` data or becomes a second task store.
- Taskset is developed using its own root config, CLI, and canonical task
  files. Keep that dogfooding workflow operational when changing core, CLI,
  workspace commands, or persisted contracts.

## Organize by Ownership

Use the architecture appropriate to the owning surface:

- Use feature-based architecture for UI and interface packages such as Kanban,
  Office, extension, TUI, and CLI.
- Use a small DDD-style modular monolith for `@taskset/core` and any future
  server runtime. Organize by domain module first, then separate domain,
  application, and infrastructure only where each layer has real behavior.
- Keep domain modules in one deployable codebase until independent deployment
  is justified. Do not introduce microservices, message brokers, or distributed
  persistence for organizational aesthetics.
- Colocate feature or module behavior, adapters, tests, and fixtures.
- Keep a `README.md` in every package and app that states its ownership and
  current contents.
- Keep public usage guidance in `README.md` and `docs/`; keep repository
  architecture and engineering guidance in `docs/maintainers/`.
- Keep canonical website blog posts in `apps/www/posts/`; do not duplicate them
  in `docs/`.
- Promote code to a shared package only when more than one owner needs the same
  stable responsibility.
- Keep client-specific state and presentation in the client. Keep shared domain
  rules in core.

Read [conventions.md](references/conventions.md) before adding or renaming source
files, packages, exports, public types, entity fields, commands, or scripts.

## Execute Safely

Before editing:

- Run `git status --short --branch`.
- Identify user-owned changes and work with them.
- Search for existing contracts, helpers, schemas, commands, and tests.
- Determine whether each target is owned source, canonical Taskset data,
  generated output, or cache.

While editing:

- Keep changes in the owning layer and update required dependents.
- Use `workspace:*` for internal dependencies.
- Declare each imported dependency in the importing package manifest.
- Consume workspace code through package exports, never sibling `src/` paths.
- Do not use TypeScript `paths` to bypass package boundaries.
- Do not hand-edit generated output or caches.
- Use structured YAML and Markdown parsers for entity files.
- Keep serialization deterministic and filesystem writes failure-safe.
- Add the smallest tests that prove the behavior and important edge cases.
- Prefer test-first work for domain rules, bug fixes, parsers, migrations, and
  lifecycle transitions. Do not write ceremonial tests before exploratory
  spikes or trivial configuration changes.

Read [workflows.md](references/workflows.md) for current commands and validation.

## Verify by Risk

Run the narrowest useful check first, then broaden:

1. Focused unit or fixture test.
2. Owning package test and type/build check.
3. Root Biome check and relevant Turbo tasks.
4. Cross-package integration test.
5. CLI, MCP, filesystem, or UI workflow test when behavior crosses those
   boundaries.

For persisted data behavior, include malformed input, round-trip stability,
path normalization, graph integrity, and interrupted-write cases as relevant.
Never claim a check passed unless it ran successfully.

## Finish the Whole Change

Before completion:

- Run `git diff --check` and review the scoped diff.
- Confirm canonical `.taskset/` files remain the only persistent authority.
- Confirm package dependencies point inward toward contracts, utilities, and
  core, not sideways between clients.
- Update `docs/` and this skill when the change alters product behavior,
  architecture, commands, persisted formats, or repository workflows.
- Add a Changeset when release policy is configured and versioned behavior
  changed.
- Do not add a Changeset for skill-only, test-only, formatting-only, or internal
  documentation changes.
- Report behavior, affected boundaries, checks run, and pre-existing failures.

Read [release.md](references/release.md) for compatibility and definition of
done.
