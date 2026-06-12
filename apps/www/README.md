# Taskset Website

`@taskset/www` contains the Taskset public documentation website.

The canonical documentation source is the repository root `docs/` directory.
The app exposes that directory through the `content` symlink and renders it
with Nextra's standard content-directory route. Do not copy documentation into
the application.

Current contents:

- a Next.js App Router scaffold under `src/app/`
- Nextra and the stock Nextra docs theme
- one catch-all route for root `docs/` Markdown
- app-local Next.js configuration

The root pnpm overrides keep Nextra on Zod 4.3.6 until its layout schemas are
compatible with Zod 4.4.x. `@taskset/contracts` continues to use its own current
Zod version. Development and production builds use Next's webpack mode because
Turbopack does not reliably discover new files through the external
documentation content symlink.

Next.js and the React compiler are dependencies of this app only. Shared
TypeScript presets remain in `@taskset/configs`; framework runtime
configuration stays here until another app needs the same stable settings.

See
[`docs/maintainers/architecture/decisions/0001-documentation-platform.md`](../../docs/maintainers/architecture/decisions/0001-documentation-platform.md).
