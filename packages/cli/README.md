# @taskset/cli

The public, scriptable command-line interface for Taskset. Install it with:

```bash
pnpm add --save-dev @taskset/cli
```

It contains argument parsing, stdout and stderr rendering, exit-code mapping,
the `taskset` executable, and the `defineConfig` helper used by
`taskset.config.ts`. Repository discovery, validation, storage, and task
behavior are delegated to `@taskset/core`.

Current commands:

- `taskset init`
- `taskset config`
- `taskset task create`
- `taskset task list`
- `taskset task show`
- `taskset task update`
- `taskset task status`
- `taskset task delete`
- `taskset tasks-for-file`
- `taskset doctor`

Commands reserve stdout for requested output, send operational failures to
stderr, and use exit code `0` for success, `1` for repository or domain
failures, and `2` for invalid CLI usage. Mutating and query commands support
JSON where scriptable output is needed.
