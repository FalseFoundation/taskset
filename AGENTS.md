# Taskset Agent Instructions

Apply the repository skill `$standards` to all planning, implementation, review,
testing, documentation, release, and architecture work.

The skill is located at:

```text
skills/standards/SKILL.md
```

Read `SKILL.md` first. Load its task-relevant references as directed:

- `references/architecture.md` for product invariants, storage, package
  ownership, client FBA, modular core/server architecture, snapshots, and docs
- `references/conventions.md` for naming, TypeScript, entity files, tests, and
  documentation style
- `references/workflows.md` for pnpm, Turbo, Vitest, TDD, and validation
- `references/release.md` for compatibility, Changesets, and completion

Treat `agents/openai.yaml` as Codex UI and invocation metadata, not repository
instructions.

Update the skill and relevant references whenever repository architecture,
commands, package names, persisted formats, documentation workflows, or
completion rules change.
