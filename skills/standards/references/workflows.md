# Workflows

## Contents

- Environment and setup
- pnpm and Turbo
- Dependency management
- Validation
- Vitest and test-driven development
- Taskset test strategy
- Persisted data and Git workflows

## Environment and Setup

Use the versions pinned by the repository:

- Node `24.16.0` from `.nvmrc`
- pnpm `11.5.2` from `packageManager`
- TypeScript and other tools from the lockfile

Initial setup:

```bash
pnpm install --frozen-lockfile
```

Do not replace pnpm with npm, Yarn, or Bun for workspace operations. Update
`.nvmrc`, `engines`, `packageManager`, and the lockfile together when changing
the supported toolchain.

## pnpm and Turbo

`pnpm-workspace.yaml` recursively includes `apps/**` and `packages/**`.

Current root commands:

```bash
pnpm dev
pnpm build
pnpm test
pnpm test:watch
pnpm lint
pnpm format
pnpm check
pnpm clean
pnpm taskset
```

Current behavior:

- `dev` runs `turbo dev`.
- `build` runs dependency builds first through Turbo.
- `test` uses Turbo to run package-local Vitest suites plus the root workspace
  architecture suite exposed as `test:architecture`.
- `test:watch` uses Turbo to start package-local Vitest watch tasks.
- `check` runs lint, tests, and the build in sequence.
- `lint` runs `biome check .` without writing fixes.
- `format` runs `biome format --write .`.
- `clean` runs the Turbo clean task.
- `taskset` runs the built entrypoint from the root workspace-installed
  `@taskset/cli` package. Build first when generated `dist/` output is absent.

`@taskset/contracts`, `@taskset/utils`, `@taskset/core`, and `@taskset/cli`
currently define `build` and `test`. Their builds run strict TypeScript
compilation into disposable `dist/` output, and their tests run the owning
source tests through the root Vitest config. Other packages remain scaffolds,
so inspect each affected manifest before assuming it defines `build`, `test`,
`typecheck`, or `dev`.

Those four packages form the public npm runtime and are published recursively.
Keep their runtime dependency chain public and keep package tarballs restricted
to built output, runtime source used by workspace development conditions, and
package documentation. Exclude tests, local build caches, and tool configs.
Their builds clean `dist/` before TypeScript emits so renamed files cannot leak
into published tarballs.

Use exact package names:

```bash
pnpm --filter @taskset/core test
pnpm --filter @taskset/cli build
pnpm --filter @taskset/mcp dev
```

The repository dogfoods Taskset through:

```bash
pnpm build
pnpm taskset config --json
pnpm taskset task list
pnpm taskset task create --title "Describe the work"
```

Package-local `test` and `test:watch` scripts are required because Turbo
orchestrates scripts declared by each workspace and filtered package commands
must remain available. Root-only architecture tests run once after Turbo rather
than being duplicated inside every package. There is no `transit` script;
Turbo's dependency traversal is orchestration, not another test suite.

`taskset.config.ts` is loaded as trusted project code using Node's native
erasable TypeScript support. Keep it free of syntax that requires TypeScript
code generation.

If Turbo reports duplicate workspace names, fix the incorrect package manifest.
Do not work around the graph with directory filters or aliases.

`pnpm update-deps` performs broad recursive upgrades, deduplication, and audit
mutation. Run it only for an explicit dependency-update task and review the
lockfile and compatibility impact.

## Dependency Management

Add dependencies to the package that imports them:

```bash
pnpm --filter <package-name> add <runtime-package>
pnpm --filter <package-name> add --save-dev <tooling-package>
pnpm --filter <package-name> add @taskset/core@workspace:*
```

Rules:

- Do not add a root dependency to make a child package compile.
- Do not rely on root hoisting, transitive dependencies, or another package's
  `node_modules`.
- Keep browser and React dependencies out of core, types, and domain-light
  utilities.
- Prefer one parser, validator, and serialization stack for the canonical file
  format.
- Review license, runtime support, ESM compatibility, maintenance, and bundle
  impact before adding foundational dependencies.
- Keep lockfile changes scoped to the dependency operation.

Frontend packages should follow the TanStack preference in
`docs/maintainers/technology.md`, but only install Query, Form, Table, Hotkeys,
Pacer, Virtual, DB, or their devtools when the owning feature uses them.

`@taskset/www` uses Next.js webpack mode for development and production because
Turbopack does not reliably discover new files through the external `docs/`
content symlink.

The website renders canonical documentation from the `apps/www/content`
symlink and canonical blog posts from `apps/www/posts/`. Add each post to
`apps/www/src/blog/posts.ts` so `/posts/[slug]` remains statically enumerable.
Docs and blog routes use separate Nextra theme wrappers.

`.github/workflows/publish-pages.yml` builds `@taskset/www` as a static export
and deploys `apps/www/out` to GitHub Pages on pushes to `main` or manual
dispatch. The workflow supplies the Pages base path through `STATIC_EXPORT` so
project sites work below the repository subpath; `/` represents a root site.
Local development and server builds keep their normal Next.js configuration.

For backend work, prefer TypeScript first. Add NestJS,
`class-transformer`, `class-validator`, and TypeORM only in the owning server
application when its architecture needs them. Use Rust for a clearly bounded
systems-level component, not as an incidental second implementation of core
domain behavior. Choose MariaDB for smaller hosted applications and PostgreSQL
for larger or more advanced relational workloads.

## Validation

Start narrow:

```bash
pnpm --filter <package-name> test
pnpm --filter <package-name> build
```

Then run relevant root checks:

```bash
pnpm lint
pnpm test
pnpm build
git diff --check
```

Use `pnpm format` only when formatting changes are intended, then inspect the
diff. Biome is authoritative; do not introduce ESLint or Prettier to solve a
local issue.

When a root check fails because of pre-existing scaffold state:

1. Confirm the failure is unrelated to the current change.
2. Run the narrowest check that validates the changed owner.
3. Report the exact blocker.
4. Fix it only when it belongs to the request or prevents reliable validation.

Never claim an unrun or failed check passed.

## Vitest and Test-Driven Development

Vitest is the default runner for TypeScript domain, filesystem, CLI adapter, and
integration tests. Use the root `vitest.config.ts` until a package needs a
distinct runtime such as browser mode. Add Vitest `projects` only when separate
Node, browser, or extension environments provide real value.
Vitest already uses Vite internally. Do not add a standalone Vite build to
Node-focused libraries or the CLI unless a concrete bundling requirement
appears; use the owning UI application's build tool for browser products.

Compile Node libraries and the CLI to `dist/` and keep the runtime `import`
export pointed at emitted JavaScript. Source exports may serve types and
development tooling, but source-only runtime exports are not a substitute for
verifying executable build artifacts.

Use this loop for domain behavior and bug fixes:

1. Write or update the smallest failing test that describes observable
   behavior.
2. Implement the minimum coherent behavior.
3. Refactor with tests green.
4. Add boundary and failure cases proportional to risk.
5. Run the owning suite, then broader repository checks.

TDD is a feedback technique, not a coverage quota. Avoid testing private helper
shape, reproducing the implementation in mocks, or creating snapshots that
hide meaningful behavioral assertions.

Vitest snapshots are acceptable for stable serialized output, diagnostics, and
small renderer fragments when review remains readable. They are unrelated to
Taskset repository safety snapshots.

## Taskset Test Strategy

### Types and schema

- valid and invalid enum values
- required and optional fields
- defaults and schema versions
- forward and backward compatibility fixtures

### Parsing and serialization

- YAML frontmatter and Markdown body separation
- deterministic key ordering and final newlines
- parse/serialize round-trip stability
- Unicode and CRLF input
- unknown, malformed, and duplicate fields
- preservation of human-authored Markdown

### Storage and CRUD

- repository discovery
- create, read, update, move, and delete
- atomic replacement and cleanup after failure
- duplicate IDs and filename collisions
- path traversal and symlink boundaries
- explicit timestamps through a test clock

### Graph and search

- missing references and cycles
- canonical versus derived relationships
- stable traversal and query ordering
- project, package, file, and directory matching
- monorepo impact analysis fixtures

### Interfaces

- CLI exit codes, stdout, stderr, and structured output
- MCP tool schemas and error mapping
- TUI keyboard behavior
- extension lifecycle and repository switching
- Kanban and Office loading, stale, conflict, and failure states

Prefer realistic fixture repositories over mocks for filesystem and Git
behavior. Keep unit-level domain logic pure where possible.

## Persisted Data and Git Workflows

Use temporary fixture repositories for tests that invoke Git. Configure test
identity locally inside the fixture; never depend on the developer's global Git
configuration.

For persisted format changes:

1. Add old-format fixtures.
2. Define read compatibility and write behavior.
3. Implement an explicit migration when rewriting is required.
4. Verify migration idempotence.
5. Preserve a recoverable backup or fail before mutation.
6. Document user-visible consequences.

For generated indexes and views:

1. Delete the derived state.
2. Rebuild it from canonical entities.
3. Verify equivalent observable output.

For concurrency-sensitive writes, test stale reads, competing updates, and
partial failures. Do not imply database-style transaction guarantees that the
filesystem and Git do not provide.
