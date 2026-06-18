---
title: Architecture Overview
description: Maintainer-facing package boundaries, runtime flow, and code organization.
---

# Architecture Overview

Taskset is a local-first modular system built around canonical Markdown files.

```text
CLI / TUI / MCP / Extension / Kanban / Office
                    |
             @taskset/core
                    |
       parse -> validate -> operate -> serialize
                    |
          .taskset/ Markdown files
                    |
         disposable indexes and views
```

## Package Direction

```text
contracts    utils
    \         /
       core
        |
cli  tui  mcp  extension  kanban  office
```

- `@taskset/contracts` owns shared runtime schemas and TypeScript contracts.
- `@taskset/utils` owns domain-light reusable primitives.
- `@taskset/core` owns domain behavior and persistence orchestration.
- Interface packages own input, rendering, transport, and interaction.
- Client packages do not become domain APIs for each other.

## Client Organization

UI and interaction surfaces use feature-based architecture. Each feature
colocates its components, state, adapters, fixtures, and tests. Shared code is
promoted only when several features genuinely depend on it.

## Core and Server Organization

Core uses a DDD-lite modular monolith:

```text
src/
├── tasks/
│   ├── domain/
│   ├── application/
│   └── infrastructure/
├── diagnostics/
├── graph/
├── generated/
├── indexing/
├── projects/
├── search/
├── snapshots/
├── sync/
└── repository/
```

This is not ceremonial DDD:

- organize by domain module first
- keep pure invariants in `domain`
- coordinate use cases in `application`
- isolate filesystem, Git, and framework code in `infrastructure`
- omit layers that have no meaningful behavior
- keep one process and deployable unit

If hosted collaboration requires a server, `apps/server` becomes a thin
composition root over core. It owns transport, authentication, authorization,
repository checkout, concurrency, and process lifecycle, not duplicate domain
rules. Prefer TypeScript and add NestJS only when the service boundary benefits
from its module and transport model. Use Rust for clearly bounded native or
systems-level components.

Relational adapters prefer MariaDB for smaller applications and PostgreSQL for
larger or more advanced workloads. No database becomes canonical Taskset state.

## Persistence Projections

Canonical tasks live in `.taskset/tasks/` as strict versionless Markdown
entities. Versioned task frontmatter is rejected instead of being silently
rewritten.

`.taskset/generated/` contains deterministic status, priority, project, and
assignee indexes. `.taskset/cache/` and generated views are disposable.
`.taskset/snapshots/` contains immutable safety checkpoints and is not normal
history or a second source of truth.

## Documentation

The root `docs/` tree contains canonical user guidance and maintainer guidance.
User pages stay at the top level. Maintainer material lives under
`docs/maintainers/`. `apps/www` renders both with Nextra. See the
[documentation platform decision](decisions/0001-documentation-platform.md).

## Decisions

- [Documentation platform](decisions/0001-documentation-platform.md)
- [Client FBA and modular core/server](decisions/0002-code-architecture.md)
- [Snapshot policy](decisions/0003-snapshot-policy.md)
- [Synchronization](synchronization.md)
