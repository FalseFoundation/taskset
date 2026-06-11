# Taskset Website

`@taskset/www` will contain the Taskset marketing and documentation website.

The canonical documentation source is the repository root `docs/` directory.
The app must render that directory directly rather than copying or symlinking
content into `apps/www`.

Accepted stack:

- Next.js App Router
- Fumadocs MDX
- plain Markdown by default
- self-hosted search initially

Implementation is intentionally deferred until the web application scaffold is
introduced. See
[`docs/architecture/decisions/0001-documentation-platform.md`](../../docs/architecture/decisions/0001-documentation-platform.md).
