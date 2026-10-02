# @taskset/cli

The public command-line adapter for Taskset. Full documentation is available at
[taskset.false.foundation](https://taskset.false.foundation/), including the
[complete CLI reference](./docs/cli-reference.md).

The published package also ships the repository `docs/` tree and `skills/` tree
beside the CLI so installed projects can load offline references from
`node_modules/@taskset/cli/docs` and `node_modules/@taskset/cli/skills`.

```bash
pnpm add --save-dev @taskset/cli
pnpm taskset init
pnpm taskset task create --title "Document the release"
```

The package owns argument tokenization, Zod-backed command validation, output,
and exit-code mapping. Repository behavior is delegated to `@taskset/core`.

Supported command groups:

- `taskset init`, `config`, `doctor`, `generate`, and `sync`
- `taskset task create|list|show|update|status|delete|migrate-ids`
- `taskset document create|import|batch|list|show|update|status|delete` (`doc` is an alias)
- `taskset snapshot create|list|restore`

Use `task list --file <path> --impact` for direct and transitive code-impact
queries. Repeated path values use OR, distinct filter categories use AND,
repeated labels require every label, and planning or timestamp ranges are
inclusive. Filters include
`--estimate-min`/`--estimate-max`, `--effort-min`/`--effort-max`,
`--duplicate`, `--sort order`, and due/created/updated before/after bounds.
`tasks-for-file` was removed.

Exit code `0` means success, `1` means a repository or domain failure, and `2`
means invalid CLI usage. Commands reserve stdout for requested output and send
diagnostics or generation warnings to stderr.

`defineConfig` is re-exported for `taskset.config.ts`:

```typescript
import { defineConfig } from '@taskset/cli'

export default defineConfig({})
```
