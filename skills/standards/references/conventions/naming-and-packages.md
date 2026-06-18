# Naming And Packages

Naming, package identity, command naming, and configuration identity.

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
- Name files and symbols for their responsibility inside the owning package.
  Prefer `config.ts`, `Config`, and `Repository` over names prefixed with the
  product or package name.
- Keep the product name only where it is part of a public identity or protocol,
  such as `taskset.config.ts`, `.taskset/`, the `taskset` command, package
  names, and user-facing prose.

Canonical workspace identities:

```text
@taskset/configs
@taskset/contracts
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

`@taskset/cli`, `@taskset/core`, `@taskset/contracts`, and `@taskset/utils` are
public npm packages. The remaining workspace identities are private until their
owning interfaces are ready for independent release. Use `@taskset/cli` in
installation and configuration examples. Use the other public package names
when consumers intentionally use their lower-level APIs.

Use the exact current manifest name in dependencies, filters, and Changesets.
Package directories and names must agree. Fix duplicate or misplaced identities
instead of documenting aliases for accidental scaffold state.

Command names use lowercase kebab-case:

```text
taskset task list --file packages/core --impact
taskset context-bundle
```

The root usage configuration is exactly `taskset.config.ts`. Export a
`schemaVersion: 1` object, preferably through `defineConfig` from
`@taskset/core`. Keep configuration fields behavioral; never use config to
redirect canonical entity storage outside `.taskset/`.

Entity field names use `camelCase`. Status, priority, and type values use stable
lowercase tokens such as `doing`, `high`, and `feature`.
