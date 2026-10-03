# Taskset agent guide

Use Taskset to plan, research, decide, operate, and track repository work as Markdown under `.taskset/`.

## What to write where

| Need | Kind | Command sketch |
| --- | --- | --- |
| User outcome | `story` | `taskset document create story --title "…"` |
| Journey / variants | `flow` | `taskset document create flow --title "…"` |
| Evidence and options | `research` | `taskset document create research --title "…"` |
| Lasting choice | `decision` / `adr` | `taskset document create adr --title "…"` |
| Recovery procedure | `runbook` | `taskset document create runbook --title "…"` |
| Recurring mistake / pattern | `lesson` | `taskset document create lesson --title "…"` |
| Open residual risk | `concern` | `taskset document create concern --title "…"` |
| Spot-check / inventory | `audit` | `taskset document create audit --title "…"` |
| Executable work | `task` | `taskset task create --title "…"` |
| Program health | parent task | `taskset task program <parent-id> --json` |

Link related entities with `--related`. Keep scratch checklists in the task body. Promote durable memory into documents mid-work.

## Install and invoke

```bash
npx @taskset/cli@latest init
npx @taskset/cli document list --json
npx @taskset/cli task list --json
pnpm dlx @taskset/cli doctor --json
yarn dlx @taskset/cli sync --json
bunx @taskset/cli document show your_document_id_here --json
```

Project or global installs also expose the `taskset` binary. Do not require `pnpm taskset`.

## Discovery

- Repository marker: nearest `.taskset/` directory
- Optional overlay: `taskset.config.ts` at that root
- Missing config: built-in defaults
- `taskset init` creates `.taskset/`; `--config` writes optional config

## Rules

- Canonical state is `.taskset/**/*.md`
- Prefer CLI mutations over hand-editing canonical files when a command exists
- Commands and `--related` use short hex `id` values (`a1b2c3`). Filename
  sequence prefixes (`0000001-…`) are display metadata only—never identity.
- Markdown hyperlinks to docs, skills, or `.taskset/` files must use the
  repository-relative filepath (for example `docs/memory-model.md` or
  `.taskset/decisions/0000003-…-81c92d.md`). Do not use a bare hex id as a
  link target.
- Prefer `--json`
- Create follow-up tasks or checklist subtasks for newly discovered work
- Create research, decision, runbook, story, flow, lesson, concern, or audit documents for durable evidence, choices, and operational memory
- Keep statuses current mid-work

## Read next

- [Agent guide](docs/agents/index.md)
- [Agent workflows](docs/agents/workflows.md)
- [Agent commands](docs/agents/commands.md)
- [Query recipes](docs/agents/query-recipes.md)
- [Document types](docs/document-types.md)
- [Memory model](docs/memory-model.md)
- [Taskset skill](skills/taskset/SKILL.md)
- [CLI reference](docs/cli-reference.md)
