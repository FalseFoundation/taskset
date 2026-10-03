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
| Executable work | `task` | `taskset task create --title "…"` |

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
- Cite short hex ids (`a1b2c3`), never filename sequence prefixes
- Prefer `--json`
- Create follow-up tasks or checklist subtasks for newly discovered work
- Create research, decision, runbook, story, or flow documents for durable evidence and choices
- Keep statuses current mid-work

## Read next

- `docs/agents/index.md`
- `docs/agents/workflows.md`
- `docs/agents/commands.md`
- `docs/document-types.md`
- `skills/taskset/SKILL.md`
- `docs/cli-reference.md`
