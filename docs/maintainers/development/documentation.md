---
title: Documentation
description: How user Markdown becomes the Taskset documentation website.
---

# Documentation

The root `docs/` directory is canonical for user-facing guidance and maintainer
guidance. Top-level pages are for users. Repository maintenance material belongs
under `docs/maintainers/`.

## Recommended Website Stack

Use Next.js App Router, Nextra, and `nextra-theme-docs` in `apps/www`.

Why:

- `apps/www` owns the public documentation renderer
- the repository already has a Next.js TypeScript preset
- Nextra supplies Markdown routing, navigation, layout, and search
- Markdown remains the source rather than a CMS database

## Content Rules

- Use `.md` unless the page needs an interactive component.
- Add `title` and `description` frontmatter.
- Keep conceptual pages separate from current command reference.
- Mark future behavior as planned.
- Link to source files with repository-relative paths.
- Keep generated API reference separate from hand-authored concepts.
- Keep architecture, ADRs, development workflows, and technology preferences
  under `docs/maintainers/`, not in top-level usage navigation.

## Integration

`apps/www/content` is a repository-relative symlink to `../../docs`. Nextra's
standard catch-all App Router page renders the content without copying it or
maintaining a second source tree.

Run the Next.js development and production builds in webpack mode. Turbopack
does not reliably discover newly added Markdown through the external content
symlink.

Keep stable public site metadata such as `docsRepositoryBase` in the owning app
configuration. Do not add a root `.env` for a non-secret constant. Use an
app-local environment variable and checked-in `.env.example` only when a value
genuinely differs by deployment.

The website may generate `.next/`, search data, and build output. These are
derived and ignored. The root Markdown files remain authoritative.

See [ADR 0001](../architecture/decisions/0001-documentation-platform.md).
