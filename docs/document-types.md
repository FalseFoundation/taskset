---
title: Choose a Taskset document type
description: Canonical stories, flows, decisions, research, runbooks, lessons, concerns, and audits.
contentType: Conceptual
navLabel: Document Types
---

# Choose a Taskset document type

Documents are how Taskset keeps product, engineering, and operational memory: what to build, what you learned, what you decided, how to recover, which mistakes not to repeat, and which residual risks remain open. Use them when the material should outlive a single task. Each type has strict common frontmatter and a body template suited to its purpose. Documents share planning, people, path, and relationship fields with tasks, and use document-specific statuses.

| Type | Directory | Template focus |
| --- | --- | --- |
| `story` | `.taskset/stories/` | user outcome and acceptance criteria |
| `flow` | `.taskset/flows/` | preconditions, journey, variants, checks |
| `decision` (`adr`, `dr`) | `.taskset/decisions/` | context, decision, alternatives, consequences |
| `research` | `.taskset/research/` | question, sources, findings, recommendation |
| `runbook` | `.taskset/runbooks/` | symptoms, checks, actions, rollback, escalation |
| `lesson` (`antipattern`) | `.taskset/lessons/` | trigger, incorrect/correct pattern, severity, prevention |
| `concern` | `.taskset/concerns/` | summary, class, trust boundary, residual risk, cadence |
| `audit` | `.taskset/audits/` | scope, method, findings, residual items, follow-ups |

Create a document from its template:

```bash
taskset document create story --title "Member signs in via SSO"
taskset document create flow --title "Recover a delayed deposit"
taskset document create adr --title "Use transactional outbox"
taskset document create research --title "Evaluate cloud providers" --related your_task_id_here
taskset document create runbook --title "Recover consumer lag"
taskset document create lesson --title "Capability flags are enablement only" --severity high --related your_task_id_here
taskset document create concern --title "Telegram capability must not grant CASL" --class authz --cadence on-release
taskset document create audit --title "Public route inventory"
```

Document IDs are immutable 5-6 character lowercase hex values. Filenames keep a
per-type display sequence and title slug, for example
`.taskset/flows/0000001-member-signs-in-via-sso-a1b2c3.md`. Agents and commands
use the short `id` in CLI flags and frontmatter relationships. The sequence
prefix is display metadata only. Markdown hyperlinks to the file must use the
repository-relative filepath. Disposable metadata indexes for that kind live
beside the files in `.taskset/flows/.generated/`.

Default statuses: `decision` → `accepted`; `runbook`, `lesson`, and `concern` →
`active`; other kinds → `draft`.

## Kind-specific metadata

| Kind | Options |
| --- | --- |
| `lesson` | `--severity low\|medium\|high\|critical`, repeatable `--related-skill`, repeatable `--pack` |
| `concern` | `--class security\|privacy\|money\|authz\|concurrency\|ops\|compliance\|other`, `--cadence <value>` |

Clear lesson/concern scalars and arrays on update with `--clear-severity`,
`--clear-related-skills`, `--clear-packs`, `--clear-class`, and `--clear-cadence`.

## Query And Mutation

Documents support the same command surface as tasks:

```bash
taskset document list research --search "queue" --owner platform --impact
taskset document list concern --directory apps/foo --status active --class authz --json
taskset document list lesson --search "casl" --severity high --json
taskset document show .taskset/research/0000003-queue-options-a1b2c3.md --include-derived --json
taskset document update .taskset/research/0000003-queue-options-a1b2c3.md --status ready --label infra --file packages/core
taskset document status .taskset/decisions/0000002-use-postgres-d4e5f6.md accepted
taskset document delete .taskset/research/0000003-queue-options-a1b2c3.md --remove-dependencies
```

Statuses are `draft`, `ready`, `active`, `accepted`, `superseded`, and
`archived`. `--related` may point at tasks or documents. Prefer complete
repository-relative canonical filenames for all relationships; unique
basenames, stems, and immutable IDs remain accepted for compatibility.

## Import Existing Markdown

Use `document import` when a repository already has material under paths such
as `docs/stories`, `docs/flows`, `docs/adr`, `docs/research`, `docs/runbooks`,
`docs/lessons`, `docs/concerns`, or `docs/audits`:

```bash
taskset document import docs/flows/0001-sign-in.md
taskset document import docs/architecture/use-postgres.md --type decision
taskset document import docs/lessons/capability.md --move
taskset document import docs/runbooks/consumer-lag.md --move
```

The type is inferred from recognized parent directory names when `--type` is
omitted. `adr`, `dr`, `decision`, and `decisions` all normalize to `decision`.
`antipattern` / `lessons` normalize to `lesson`. The first H1 supplies the title
unless `--title` is passed. Existing frontmatter is replaced with Taskset's
canonical metadata while the Markdown body is preserved. Import copies by
default; `--move` removes the source only after the canonical file has been
written successfully.

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
taskset sync --fix --dry-run --json
taskset sync --fix --concurrency 8
```

`taskset sync` preflights every canonical file and reports all invalid fields,
types, relationships, and required headings before mutation. `--fix` may infer a
missing document type from its canonical directory and add empty missing
template sections; it never overrides a conflicting explicit type. Sync stages
and validates the entire result, then atomically publishes canonical files. It
migrates legacy task and document IDs to short hex IDs, normalizes
`{sequence}-{slug}-{id}.md` filenames, repairs duplicate sequence prefixes by
`createdAt`, rewrites repository text references, refreshes data `.gitignore`
rules for scoped `.generated/` directories, removes legacy global
generated directories, and rebuilds disposable views.

For the chooser between task bodies and document kinds, see
[Memory model](memory-model.md).
