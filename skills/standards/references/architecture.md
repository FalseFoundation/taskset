# Architecture

## Contents

- Product direction
- Source-of-truth model
- Repository ownership
- Dependency flow
- Client and server architecture
- Storage and graph rules
- Snapshot policy
- Documentation architecture
- Interfaces and integrations
- Generated sources

## Product Direction

Taskset began as an offline, inline, AI-friendly, human-readable task manager
designed to accelerate software delivery and give development teams immediate
awareness of the work surrounding their code.

It grows from that core into a Git-native software delivery platform. Tasks,
epics, specifications, architecture decisions, releases, runbooks, and project
knowledge live beside the code as human-readable Markdown.

Vision: become the Git-native operating system for software delivery.

Mission: let developers, AI systems, and stakeholders work through different
interfaces without creating a second source of truth outside the repository.

Design for:

- Markdown that remains useful without Taskset installed
- Git history, branches, pull requests, and reviews as native workflows
- deterministic machine-readable metadata with human-authored prose
- monorepos and code-to-work relationships as first-class concepts
- one domain engine shared by CLI, TUI, MCP, extension, web, and dashboards
- local-first operation without preventing explicit hosted adapters
- immediate team and AI awareness without a mandatory hosted service
- replaceable indexes and generated views
- schema evolution that does not silently corrupt existing repositories

Near-term work should prove the core task workflow before broadening the entity
model or investing in additional interfaces.

## Source-of-Truth Model

Canonical project state lives under `.taskset/`.

```text
.taskset/
├── tasks/
├── epics/
├── specs/
├── decisions/
├── releases/
├── runbooks/
├── generated/
└── cache/
```

Rules:

- Entity Markdown files are authoritative persisted state.
- `taskset.config.ts` is the discoverable repository usage configuration. It
  controls validated behavior and defaults, not canonical entity state.
- YAML frontmatter contains structured metadata. Markdown bodies contain
  durable human context.
- Do not store the same field independently in frontmatter and body.
- `generated/` and `cache/` are derived, disposable, and never required to
  recover canonical state.
- An in-memory index or optional on-disk cache may accelerate reads, but it must
  be rebuildable from canonical files.
- Do not introduce SQLite, a remote service, browser storage, editor global
  state, or another hidden store as an undeclared authority.
- Git is the versioning and collaboration layer around the files. Do not assume
  it provides database transactions or conflict-free identifiers.
- Repository discovery walks upward for exactly `taskset.config.ts`; canonical
  storage remains fixed under `.taskset/`.

Any persisted format change must define validation, compatibility, migration,
and failure behavior before implementation.

## Repository Ownership

| Path | Ownership |
| --- | --- |
| `packages/contracts/` | Shared entity schemas, enums, DTOs, configuration types, and integration contracts; package `@taskset/contracts` |
| `packages/utils/` | Reusable domain-light filesystem, path, Markdown, and frontmatter primitives; package `@taskset/utils` |
| `packages/core/` | Entity operations, parsing orchestration, validation, storage, indexing, graph rules, search, filtering, project discovery, and impact analysis; package `@taskset/core` |
| `packages/cli/` | Command-line adapter over core; package `@taskset/cli` |
| `packages/tui/` | Keyboard-driven terminal interface over core; package `@taskset/tui` |
| `packages/mcp/` | MCP tools and context bundles over core; package `@taskset/mcp` |
| `packages/kanban/` | Web Kanban interface and board-specific presentation; package `@taskset/kanban` |
| `packages/extension/` | VS Code integration, explorers, hovers, code lenses, and editor commands; package `@taskset/extension` |
| `packages/configs/` | Shared TypeScript and tool configuration; package `@taskset/configs` |
| `apps/office/` | Stakeholder dashboards, roadmaps, reports, and planning views; package `@taskset/office` |
| `apps/www/` | Marketing site, public documentation, guides, and examples; package `@taskset/www` |
| `docs/` | First-party repository and product documentation |
| `skills/` | Agent-facing repository standards and workflows |

Directory names and manifest package names must agree. Duplicate workspace
package names are invalid. Treat a mismatch such as a `packages/core` manifest
named `@taskset/cli` as a scaffold defect to fix, not an established identity.
Every package and app has a `README.md` describing its purpose, owned behavior,
and current implementation status.

The publishable npm runtime is `@taskset/cli` and its dependency chain:
`@taskset/core`, `@taskset/contracts`, and `@taskset/utils`. Other workspace
packages and apps remain private until they have an intentional public
contract. Recursive publication must preserve this runtime dependency closure.

Do not add a top-level owner when an existing package or app already fits.
Within an owning package, prefer responsibility-based names such as `config.ts`
and `Config` over product-prefixed names such as `tasksetConfig.ts` and
`TasksetConfig`. Reserve the Taskset name for public identity and protocol
surfaces such as package names, the CLI command, `taskset.config.ts`, and
`.taskset/`.

Taskset dogfoods these boundaries. The root workspace installs core and CLI,
loads `taskset.config.ts`, and stores its own planned work in `.taskset/tasks/`.

## Dependency Flow

The intended dependency direction is:

```text
configs

contracts    utils
    \         /
       core
        |
cli  tui  mcp  extension  kanban  office

www (product documentation and marketing; no domain authority)
```

Rules:

- `contracts` must not depend on core or a client package.
- `utils` must not depend on core or a client package.
- `core` may depend on contracts and utils.
- Product interfaces may depend on core and contracts.
- A client package must not become the domain API for another client.
- Apps may consume packages; shared packages must not depend on apps.
- Keep framework-specific DTOs and view models in the owning interface unless
  they are stable cross-interface contracts.
- Import workspace code through manifest exports and declare it with
  `workspace:*`.

If a browser or editor runtime cannot access the filesystem directly, introduce
a thin host adapter that delegates to core. Do not move domain rules into the
transport layer.

## Core Runtime Flow

```text
CLI / TUI / MCP / Extension / Kanban / Office
                    |
             @taskset/core API
                    |
       parse -> validate -> operate -> serialize
                    |
          canonical .taskset/ Markdown
                    |
       derived index / graph / generated views
```

Core owns behavior such as:

- repository discovery and configuration loading
- configuration validation and task creation defaults
- entity parsing and validation
- deterministic serialization
- atomic create, update, move, and delete operations
- status and lifecycle transitions
- search and filtering
- dependency and relationship graph construction
- cycle and broken-reference detection
- monorepo project and package discovery
- code-path relationships and impact analysis

Interfaces own input, rendering, transport, and user interaction. They call core
operations rather than reproducing these rules.

## Client and Server Architecture

### Feature-based clients

Apply FBA to presentation and interaction surfaces: Kanban, Office, extension,
TUI, CLI, and the documentation website.

Example feature roots:

```text
src/
├── tasks/
├── search/
├── graph/
├── projects/
├── context/
└── shared/
```

Guidelines:

- Colocate feature implementation, tests, fixtures, and presentation.
- Keep package entrypoints thin.
- Use `shared/` only for code genuinely shared by several features in that
  package.
- Promote behavior to `contracts`, `utils`, or `core` only when its ownership
  matches that package.
- Avoid generic catch-all modules such as a growing `helpers.ts`.
- Keep board state in Kanban, editor state in the extension, terminal state in
  TUI, and stakeholder presentation in Office.

### DDD-lite modular monolith

Use a modular monolith for core and future server-side code. Organize by domain
module before technical layer:

```text
src/
├── tasks/
│   ├── domain/
│   ├── application/
│   └── infrastructure/
├── graph/
├── projects/
├── search/
└── repository/
```

Keep this deliberately small:

- `domain/` contains entities, value objects, invariants, and pure policies.
- `application/` contains use cases and ports that coordinate domain behavior.
- `infrastructure/` contains filesystem, Git, process, network, and framework
  adapters.
- Omit a layer when a module does not need it.
- Communicate between modules through explicit public APIs, not internal file
  imports.
- Keep one process and one deployable unit until scale or isolation provides a
  measured reason to split it.

`@taskset/core` is the reusable modular domain engine. If remote Office or
hosted collaboration later requires a server, introduce `apps/server/` as a
thin composition root over core. The server owns transport, authentication,
authorization, repository checkout, concurrency, and process lifecycle. It
does not become a second implementation of Taskset rules.

## Storage and Graph Rules

- Parse frontmatter with a YAML parser and Markdown with a structured parser
  where structure matters. Do not parse entity files with ad hoc regular
  expressions.
- Normalize stored code references to repository-relative POSIX paths.
- Reject paths that escape the repository or `.taskset/` ownership boundary.
- Keep IDs immutable. Do not adopt sequential IDs without a documented
  branch-collision strategy.
- Store one canonical direction for inverse relationships unless the schema
  explicitly defines otherwise. Derive `blocks` from `dependsOn`, for example,
  rather than allowing silent divergence.
- Detect duplicate IDs, missing targets, invalid transitions, and dependency
  cycles with actionable diagnostics.
- Preserve meaningful Markdown content during metadata edits.
- Never silently discard unknown or invalid data. Reject it or preserve it
  according to an explicit schema policy.
- Write through temporary files and atomic replacement where the platform
  permits it. A failed update must not leave a truncated entity.
- Make ordering deterministic where order has no domain meaning.

## Snapshot Policy

Git commits and branches are the normal history and rollback mechanism. Do not
duplicate that history in a Taskset-owned snapshot database.

A future explicit snapshot capability is acceptable only as a safety mechanism
for uncommitted state before migrations, imports, repair commands, or bulk
mutation:

- snapshots are user-invoked or created immediately before a destructive
  operation
- snapshots are immutable, timestamped, and content-addressable where practical
- snapshots contain canonical Taskset files and enough metadata to explain why
  they exist
- snapshots are non-authoritative and may be deleted without changing current
  project state
- restore is explicit and conflict-aware
- snapshots do not replace Git commits, reflogs, or normal backups

Do not include snapshots in the MVP unless a destructive workflow requires
them. Start with dry runs, atomic writes, and Git-aware warnings.

## Documentation Architecture

`docs/` is the canonical source for documentation. Its top-level pages contain
user-facing product guidance. `docs/maintainers/` owns product direction,
architecture, ADRs, engineering workflows, and technology policy. Keep the
maintainer section visibly separate from the primary usage flow.

`apps/www/` renders `docs/` through Nextra. Its `content` symlink points to the
root `docs/` directory so the app does not maintain a copied documentation
tree. Chronological release and project posts are a separate website-owned
content type stored canonically in `apps/www/posts/`.

Use plain Markdown by default. Use MDX only when a page needs an interactive
component. Keep frontmatter compatible with the documentation renderer.

Recommended website stack:

- Next.js App Router because the repository already carries a Next.js shared
  configuration and `apps/www` also owns marketing pages
- Nextra with the stock docs and blog themes
- Nextra's standard content-directory catch-all route
- route-isolated docs and blog layouts with separate MDX component sets
- self-hosted search initially; no CMS or remote content database

Register blog posts in the app-local post registry so static export can
enumerate `/posts/[slug]`. Keep blog posts in plain Markdown by default with
`title`, `description`, and `date` frontmatter. Do not merge docs and blog theme
wrappers in the global MDX component map.

Keep architectural decisions under
`docs/maintainers/architecture/decisions/`.
Update user docs, maintainer docs, tests, and this standards skill together
when their contracts change.

## Interfaces and Integrations

- CLI commands are scriptable: stable exit codes, useful stdout, diagnostics on
  stderr, and structured output when supported.
- MCP tools expose the same validated operations as CLI and other clients. MCP
  must not bypass filesystem, graph, or lifecycle rules.
- TUI, Kanban, extension, and Office are projections over core state, not
  independent stores.
- Office needs an explicit repository, branch, authentication, refresh, and
  write-concurrency model before it performs remote mutations.
- Integration packages use explicit import, export, or synchronization
  contracts. Conflicts and ownership direction must be visible.
- GitHub, Jira, Linear, ClickUp, and Notion are integrations, not implicit
  authorities.

## Generated Sources

Treat these as generated or ephemeral unless an owning tool says otherwise:

- `node_modules/`
- `dist/`, `build/`, `out/`, `.next/`
- `.turbo/`, coverage, logs, and `*.tsbuildinfo`
- `.taskset/cache/`
- `.taskset/generated/`
- Nextra and Next.js generated website output

Change the source or generator, then regenerate. Never make a manual output edit
the final implementation.
