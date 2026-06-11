# Contributing to Taskset

Taskset is pre-alpha. Contributions should strengthen the core file format and
workflow before expanding the number of interfaces.

## Before You Start

Read:

- [AGENTS.md](AGENTS.md)
- [skills/standards/SKILL.md](skills/standards/SKILL.md)
- [docs/product/vision.md](docs/product/vision.md)
- [docs/architecture/overview.md](docs/architecture/overview.md)

Discuss changes that affect persisted formats, package boundaries, public
commands, synchronization, or snapshots before implementing them.

## Setup

```bash
pnpm install --frozen-lockfile
pnpm check
```

Use the Node and pnpm versions declared by `.nvmrc` and `packageManager`.

## Development Rules

- Keep `.taskset/` Markdown files as the persistent source of truth.
- Put shared domain behavior in `@taskset/core`, not in an interface package.
- Keep core and future server code as a simple modular monolith.
- Use FBA inside UI and interaction surfaces.
- Add dependencies to the package that imports them.
- Use `workspace:*` for internal dependencies.
- Preserve deterministic serialization and human-authored Markdown.
- Prefer test-first development for domain rules, parsers, migrations, state
  transitions, and bug fixes.
- Update docs and `skills/standards/` when contracts or workflows change.

## Testing

Run the narrowest relevant test first:

```bash
pnpm test
pnpm lint
pnpm build
```

Use temporary repositories for filesystem and Git integration tests. Tests must
not depend on a contributor's global Git configuration, network, or wall clock.

## Pull Requests

Keep pull requests focused and explain:

- the behavior being changed
- architecture or persisted-format consequences
- compatibility or migration impact
- tests and checks that ran
- known limitations or follow-up work

Before requesting review:

```bash
pnpm check
git diff --check
```

Add a Changeset when release configuration is active and a versioned package
contract changes. Do not add one for documentation-only or standards-only work.

By participating, you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
