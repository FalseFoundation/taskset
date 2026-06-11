# Taskset

Taskset is an offline, inline, AI-friendly, human-readable task manager built to
accelerate software delivery and give development teams immediate awareness of
the work surrounding their code.

Taskset stores tasks and project knowledge as Markdown inside the repository.
The files remain useful to people, editors, scripts, and AI agents without a
mandatory hosted service or proprietary database.

> Status: pre-alpha. The repository is establishing its core contracts before
> implementing the first CLI workflow.

## Why Taskset

Most project-management tools move delivery context away from the code. Taskset
keeps it close:

- offline and local-first by default
- Markdown and YAML frontmatter that humans can read and review
- Git-native history, branching, pull requests, and collaboration
- one source of truth for CLI, TUI, MCP, editor, web, and reporting interfaces
- monorepo and code-to-task awareness
- context that AI systems can inspect without a separate synchronization layer

Canonical project data will live under `.taskset/`. Generated views and caches
must always be rebuildable from those files.

## Planned Surfaces

- `@taskset/core`: parsing, validation, storage, graph, search, and workflows
- `@taskset/cli`: scriptable command-line interface
- `@taskset/tui`: keyboard-driven terminal workspace
- `@taskset/mcp`: tools and context bundles for AI systems
- `@taskset/extension`: VS Code integration
- `@taskset/kanban`: web board
- `@taskset/office`: stakeholder dashboards and planning
- `@taskset/www`: marketing and product documentation

The MVP focuses on task files, deterministic parsing and serialization,
validation, safe CRUD, lifecycle commands, and repository diagnostics.

## Architecture

Taskset uses different organization styles for different responsibilities:

- UI and interface packages use feature-based architecture.
- Core and future server-side code use a small DDD-style modular monolith.
- Git provides normal history; Taskset-specific snapshots are reserved for
  explicit safety checkpoints around destructive operations.
- Vitest is the default TypeScript test runner, with test-first development
  preferred for domain behavior and regressions.

Read [the architecture overview](docs/architecture/overview.md) for details.

## Development

Requirements:

- Node.js `24.16.0`
- pnpm `11.5.2`

```bash
pnpm install --frozen-lockfile
pnpm check
```

Useful commands:

```bash
pnpm dev
pnpm build
pnpm test
pnpm test:watch
pnpm lint
pnpm format
```

## Documentation

Product and contributor documentation lives in [`docs/`](docs/README.md).
`apps/www` will render that same content with Next.js App Router and Fumadocs
MDX rather than maintaining a copied documentation tree.

Start with:

- [Product vision](docs/product/vision.md)
- [Task files](docs/concepts/task-files.md)
- [Architecture](docs/architecture/overview.md)
- [Testing](docs/development/testing.md)
- [Documentation workflow](docs/development/documentation.md)

## Agent Standards

Repository-aware coding agents should begin with [`AGENTS.md`](AGENTS.md) and
the canonical [`skills/standards/SKILL.md`](skills/standards/SKILL.md).

The standards skill must be updated in the same change whenever repository
architecture, package identities, commands, persisted formats, documentation
workflows, or completion rules change.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing. Report
security-sensitive issues through the process in [SECURITY.md](SECURITY.md).
