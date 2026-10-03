# Product And Source

Product direction and the canonical source-of-truth model.

## Product Direction

Taskset began as an offline, inline, AI-friendly, human-readable delivery
workspace: not only tasks, but the plans, research, decisions, flows, and
runbooks that make delivery coherent.

It is a Git-native software delivery platform. Stories, flows, decisions,
research, runbooks, lessons, concerns, audits, and tasks live beside the code as
human-readable Markdown.

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
- explicit compatibility work that does not silently corrupt existing
  repositories

Near-term work should keep the task and supporting-document workflows coherent
before inventing freeform kinds (`note`, `rfc`, `epic`, `spec`) or investing
heavily in new interfaces. Operational memory kinds (`lesson`, `concern`,
`audit`) are first-class document kinds under the existing document command
surface.

## Source-of-Truth Model

Canonical project state lives under `.taskset/`.

```text
.taskset/
├── tasks/
│   └── .generated/          # disposable task metadata indexes
├── stories/
│   └── .generated/
├── flows/
│   └── .generated/
├── decisions/
│   └── .generated/
├── research/
│   └── .generated/
├── runbooks/
│   └── .generated/
├── lessons/
│   └── .generated/
├── concerns/
│   └── .generated/
├── audits/
│   └── .generated/
├── snapshots/
└── cache/
```

Rules:

- Entity Markdown files are authoritative persisted state.
- The nearest `.taskset/` directory is the discoverable repository marker.
  Optional `taskset.config.ts` at that root overlays validated behavior and
  defaults. Missing config uses built-in defaults. Config never owns entity
  state.
- YAML frontmatter contains structured metadata. Markdown bodies contain
  durable human context.
- Do not store the same field independently in frontmatter and body.
- Each entity folder owns its disposable `.generated/` indexes. `.taskset/cache/`
  is also disposable. Neither is required to recover canonical state.
- `snapshots/` contains immutable, non-authoritative safety checkpoints for
  migrations and explicit restore workflows.
- An in-memory index or optional on-disk cache may accelerate reads, but it must
  be rebuildable from canonical files.
- Do not introduce SQLite, a remote service, browser storage, editor global
  state, or another hidden store as an undeclared authority.
- Git is the versioning and collaboration layer around the files. Do not assume
  it provides database transactions or conflict-free identifiers.
- Repository discovery walks upward for `.taskset/`; canonical storage remains
  fixed under that directory.

Any persisted format change must define validation, compatibility, migration,
and failure behavior before implementation.
