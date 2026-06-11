# Conventions

## Contents

- General design
- Naming and package identity
- TypeScript and exports
- Taskset entity files
- CLI and interface behavior
- UI organization
- Shell and tooling
- Tests and documentation

## General Design

- Reuse before adding. Extend the existing source of truth when the concept
  already exists.
- Prefer explicit data flow, typed state, discriminated variants, and
  structured errors over string coordination.
- Keep functions and modules focused. Split by responsibility, not arbitrary
  line count.
- Separate pure parsing, validation, graph, and query logic from filesystem
  effects where practical.
- Fail with actionable diagnostics for invalid persisted state or destructive
  operations.
- Comment format constraints and non-obvious tradeoffs. Do not narrate obvious
  code.
- Keep diffs narrow. Do not combine behavior changes with unrelated renaming or
  cleanup.

## Naming and Package Identity

- Directories: lowercase; use kebab-case for multiword names.
- TypeScript modules: camelCase when named after behavior, kebab-case when the
  local feature already uses it. Stay consistent within an owner.
- React components and providers: `PascalCase.tsx`.
- Hooks: `useThing.ts`; exported function `useThing`.
- Variables and functions: `camelCase`.
- Types, interfaces, classes, components, and schemas: `PascalCase`.
- Stable protocol and schema constants: `UPPER_SNAKE_CASE`.
- Colocated tests: source filename plus `.test.ts` or `.test.tsx`.
- Integration and E2E specs: descriptive kebab-case ending in `.spec.ts`.
- Shell scripts: kebab-case.

Canonical workspace identities:

```text
@taskset/configs
@taskset/types
@taskset/utils
@taskset/core
@taskset/cli
@taskset/tui
@taskset/mcp
@taskset/kanban
@taskset/extension
@taskset/office
@taskset/www
```

Use the exact current manifest name in dependencies, filters, and Changesets.
Package directories and names must agree. Fix duplicate or misplaced identities
instead of documenting aliases for accidental scaffold state.

Command names use lowercase kebab-case:

```text
taskset tasks-for-file
taskset context-bundle
```

Entity field names use `camelCase`. Status, priority, and type values use stable
lowercase tokens such as `doing`, `high`, and `feature`.

## TypeScript and Exports

Root `biome.json` controls formatting:

- tabs
- 100-column target
- single quotes
- no semicolons
- trailing commas
- bracket spacing

Follow these rules:

- Keep strict TypeScript enabled.
- Use `unknown` at filesystem, YAML, JSON, Git, process, and network boundaries,
  then validate and narrow it.
- Avoid `any`; contain unavoidable casts at the boundary.
- Use `import type` or inline type imports for type-only dependencies.
- Preserve `.js` relative import specifiers when a NodeNext ESM build requires
  them.
- Prefer named exports and explicit package entrypoints.
- Declare every imported package in the importing package's `package.json`.
- Use `workspace:*` for internal dependencies.
- Import shared code through package exports such as `@taskset/core` or an
  explicit subpath. Never import a sibling package's `src/`.
- Do not use TypeScript `paths` to imitate package exports or reach another
  package's `node_modules`.
- Keep public data immutable where mutation is not part of the contract.
- Represent expected failures with typed errors or result variants. Include the
  entity path, field, and remediation when useful.
- Do not leak a CLI parser, UI framework, MCP SDK, or filesystem library type
  into domain contracts.

Shared configuration is consumed through `@taskset/configs` exports. Extend
those exports when a preset is genuinely reusable; keep app-specific settings
with the app.

## Taskset Entity Files

Use YAML frontmatter for machine metadata and Markdown for human context:

```markdown
---
id: TS-01J...
title: Add task validation
status: doing
priority: high
labels:
  - core
dependsOn: []
files:
  - packages/core/src/tasks/validateTask.ts
---

# Context

Describe why the work exists.

# Acceptance Criteria

- [ ] Invalid statuses produce an actionable diagnostic.
```

Rules:

- Define one canonical representation for each field.
- Use repository-relative POSIX paths in persisted metadata.
- Serialize timestamps as explicit ISO 8601 strings in UTC.
- Keep IDs immutable and compare them exactly.
- Preserve user-authored body text and meaningful list order.
- Use stable key ordering and one final newline in generated output.
- Omit absent optional fields consistently; do not alternate between missing,
  empty, and `null` without schema meaning.
- Validate enum values, dates, paths, IDs, and relationship targets centrally.
- Do not infer `updatedAt` or lifecycle timestamps differently in each client.
- Do not write derived inverse relationships into files unless the schema makes
  them independently authoritative.
- Treat schema additions, removals, defaults, and coercions as compatibility
  decisions.
- Never silently repair a file during a read. `doctor` may propose or perform
  explicit fixes with user-visible output.

Keep schemas and static contracts in `@taskset/types`. Keep parsing orchestration,
defaults, transitions, validation policy, and migrations in `@taskset/core`.
Keep generic YAML/Markdown mechanics in `@taskset/utils` only when they are not
Taskset-specific.

## CLI and Interface Behavior

- Keep CLI commands thin: parse arguments, call core, render results, map errors
  to exit codes.
- Reserve stdout for requested output and stderr for diagnostics.
- Avoid interactive prompts when flags or stdin make automation possible.
- Provide deterministic structured output before integrations depend on parsing
  decorative terminal text.
- Keep TUI keyboard behavior and state in TUI, not core.
- Keep MCP tool schemas close to MCP adapters while reusing domain schemas.
- Keep extension commands and VS Code lifecycle behavior in the extension.
- Keep filtering and graph semantics in core; clients may own only view-specific
  sorting, grouping, and layout.

## UI Organization

No repository-wide UI framework is authoritative yet. Do not encode a framework
or component library as a standard until the owning manifests and implementation
adopt it.

For Kanban and Office:

- Organize by product feature, then colocate components, hooks, tests, and styles.
- Keep server or host communication behind typed adapters.
- Represent loading, empty, invalid-repository, stale, conflict, and error states
  explicitly.
- Preserve keyboard, focus, labels, roles, and screen-reader behavior.
- Share UI through a dedicated package only after more than one surface needs a
  stable visual contract.
- Do not put React stores or UI dependencies in `@taskset/utils`.

## Shell and Tooling

- Start Bash scripts with `set -euo pipefail`.
- Derive `repo_root` from the script location.
- Quote paths and variable expansions.
- Validate prerequisites before mutation.
- Make setup and generation idempotent.
- Use temporary directories and traps for cleanup.
- Print concise, prefixed, actionable errors.
- Keep automation with its owning package or a focused tooling directory when
  one is introduced.
- Do not add root scripts that duplicate package-manager or Turbo behavior.

## Tests and Documentation

- Use Vitest as the default TypeScript unit and integration test runner.
- Use explicit imports from `vitest`; do not enable test globals repository-wide.
- Prefer test-first development for domain rules, parser behavior, lifecycle
  transitions, graph invariants, migrations, and bug regressions.
- Do not force test-first ceremony for documentation, formatting, generated
  configuration, or short-lived exploratory work.
- Add regression coverage for bug fixes.
- Test behavior and boundary contracts, not implementation trivia.
- Use temporary directories for filesystem tests.
- Use fixture repositories for Git, monorepo discovery, and path-impact tests.
- Cover CRLF/LF, Unicode, empty bodies, malformed YAML, duplicate IDs, broken
  links, cycles, and interrupted writes where relevant.
- Verify parse/serialize round trips without losing Markdown.
- Keep unit tests deterministic and independent of user Git configuration,
  network services, wall-clock time, and the actual repository.
- Mark integration prerequisites explicitly.
- Use current paths and package names in documentation.
- Keep canonical product documentation in `docs/`; `apps/www` renders it.
- Prefer `.md` for content. Use `.mdx` only when interactive React content is
  required.
- Include `title` and `description` frontmatter on pages rendered by the docs
  site.
- Keep product plans distinct from executable specifications.
- Update docs when commands, persisted formats, or public package contracts
  change.
- Update `skills/standards/` in the same change when these repository standards
  or workflows change.
