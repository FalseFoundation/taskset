# Ownership And Dependencies

Repository ownership, package identity, dependency flow, and core runtime ownership.

## Repository Ownership

| Path | Ownership |
| --- | --- |
| `packages/contracts/` | Shared entity schemas, enums, DTOs, configuration types, and integration contracts; package `@taskset/contracts` |
| `packages/utils/` | Reusable domain-light date, filesystem, path, Markdown, and frontmatter primitives; package `@taskset/utils` |
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
- immutable snapshots, schema migrations, and generated metadata views

Interfaces own input, rendering, transport, and user interaction. They call core
operations rather than reproducing these rules.
