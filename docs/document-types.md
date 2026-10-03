---
title: Document Types
description: Canonical stories, flows, decisions, research, and runbooks.
---

# Document Types

Taskset stores durable project context beside tasks without forcing every note
into a task lifecycle. Each type has strict common frontmatter and a body
template suited to its purpose. Documents use the same planning, people, path,
and relationship metadata fields as tasks, with document-specific statuses.

| Type | Directory | Template focus |
| --- | --- | --- |
| `story` | `.taskset/stories/` | user outcome and acceptance criteria |
| `flow` | `.taskset/flows/` | preconditions, journey, variants, checks |
| `decision` (`adr`, `dr`) | `.taskset/decisions/` | context, decision, alternatives, consequences |
| `research` | `.taskset/research/` | question, sources, findings, recommendation |
| `runbook` | `.taskset/runbooks/` | symptoms, checks, actions, rollback, escalation |

Create a document from its template:

```bash
taskset document create story --title "Member signs in via SSO"
taskset document create flow --title "Recover a delayed deposit"
taskset document create adr --title "Use transactional outbox"
taskset document create research --title "Evaluate queue providers" --related <task-id>
taskset document create runbook --title "Recover consumer lag"
```

Document IDs are immutable 5-6 character lowercase hex values. Filenames keep a
per-type display sequence and title slug, for example
`.taskset/flows/0000001-member-signs-in-via-sso-a1b2c3.md`. Agents and commands
reference the short `id`. Disposable metadata indexes for that kind live beside
the files in `.taskset/flows/.generated/`.

## Query And Mutation

Documents support the same command surface as tasks:

```bash
taskset document list research --search "queue" --owner platform --impact
taskset document show <document-id> --type research --include-derived --json
taskset document update <document-id> --status ready --label infra --file packages/core
taskset document status <document-id> accepted --type decision
taskset document delete <document-id> --remove-dependencies
```

Statuses are `draft`, `ready`, `active`, `accepted`, `superseded`, and
`archived`. `--related` may point at tasks or documents. `--depends-on` and
`--parent` must resolve to other Taskset documents.

## Import Existing Markdown

Use `document import` when a repository already has material under paths such
as `docs/stories`, `docs/flows`, `docs/adr`, `docs/research`, or
`docs/runbooks`:

```bash
taskset document import docs/flows/0001-sign-in.md
taskset document import docs/architecture/use-postgres.md --type decision
taskset document import docs/runbooks/consumer-lag.md --move
```

The type is inferred from recognized parent directory names when `--type` is
omitted. `adr`, `dr`, `decision`, and `decisions` all normalize to `decision`.
The first H1 supplies the title unless `--title` is passed. Existing
frontmatter is replaced with Taskset's canonical metadata while the Markdown
body is preserved. Import copies by default; `--move` removes the source only
after the canonical file has been written successfully.

Use `document list [type]`, `document show <id>`, and `--json` for inspection
and automation. Sequences are per type, so pass `--type` to `document show`
when the same ID exists in more than one kind.

## Batch Workflows

Use a JSON manifest when an agent or migration needs to create, import, update,
or export many documents. Operations run through a bounded TanStack Pacer queue;
progress such as `3/8 (38%)` is written to stderr, while `--json` keeps stdout
safe for automation.

```json
[
  { "action": "create", "input": { "type": "story", "title": "Member upgrades" } },
  { "action": "import", "sourcePath": "docs/flows/checkout.md", "options": { "type": "flow" } },
  { "action": "update", "id": "a1b2c3", "type": "story", "input": { "status": "ready" } },
  { "action": "export", "id": "a1b2c3", "type": "story", "targetPath": "exports/member-upgrades.md" }
]
```

```bash
taskset document batch taskset-documents.json --concurrency 4 --json
taskset sync --concurrency 8
```

`taskset sync` creates missing document-kind directories inside `.taskset`,
migrates legacy task and document IDs to short hex IDs, normalizes
`{sequence}-{slug}-{id}.md` filenames, repairs duplicate sequence prefixes by
`createdAt`, rewrites repository text references, refreshes data `.gitignore`
rules for scoped `.generated/` directories, removes legacy global
`.taskset/generated/`, and rebuilds generated views. Build outputs,
dependencies, caches, snapshots, and Git internals are excluded from reference
rewriting.
