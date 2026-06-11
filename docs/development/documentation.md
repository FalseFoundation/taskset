---
title: Documentation
description: How canonical Markdown becomes the Taskset documentation website.
---

# Documentation

The root `docs/` directory is canonical. It must remain readable on a Git host
without the website.

## Recommended Website Stack

Use Next.js App Router and Fumadocs MDX in `apps/www`.

Why:

- `apps/www` owns both marketing and documentation
- the repository already has a Next.js TypeScript preset
- Fumadocs supplies content collections, navigation, layouts, and search
- Markdown remains the source rather than a CMS database

Astro Starlight is the simpler alternative if documentation becomes a separate
standalone site. Docusaurus is unnecessary unless versioned docs and its plugin
ecosystem become primary requirements.

## Content Rules

- Use `.md` unless the page needs an interactive component.
- Add `title` and `description` frontmatter.
- Keep conceptual pages separate from current command reference.
- Mark future behavior as planned.
- Link to source files with repository-relative paths.
- Keep generated API reference separate from hand-authored concepts.

## Planned Integration

`apps/www/source.config.ts` should point its Fumadocs collection at `../../docs`
using an absolute resolved path. Routes under `/docs` load that collection.
Marketing routes stay under the same Next.js application.

The website may generate `.source/`, search data, and build output. These are
derived and ignored. The root Markdown files remain authoritative.

See [ADR 0001](../architecture/decisions/0001-documentation-platform.md).
