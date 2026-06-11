---
title: "ADR 0001: Documentation Platform"
description: Render canonical root documentation through the Taskset website.
---

# ADR 0001: Documentation Platform

- Status: Accepted
- Date: 2026-06-12

## Context

Taskset needs one documentation source that is readable on Git hosts and can
also power a polished website. `apps/www` owns both marketing and product
documentation.

## Decision

- Keep canonical content in the root `docs/` directory.
- Use plain Markdown by default and MDX only for interactive pages.
- Build `apps/www` with Next.js App Router and Fumadocs MDX.
- Configure the Fumadocs source to read the root `docs/` directory directly.
- Start with self-hosted search and no CMS.

Fumadocs supports Markdown/MDX collections and a Next.js integration:

- <https://www.fumadocs.dev/docs/mdx/next>
- <https://www.fumadocs.dev/docs/mdx/collections>

## Why

This keeps marketing and docs in one React application, matches the existing
Next.js configuration direction, provides navigation and search without
building a docs engine, and avoids copying source files.

Astro Starlight remains a reasonable alternative for a standalone docs-only
site, but adding a second web framework is unnecessary while `apps/www` also
owns marketing pages.

## Implementation Contract

The future `apps/www/source.config.ts` should resolve `../../docs` as its docs
collection directory. The app may generate `.source/`, search indexes, and
static output, but none of those become documentation source.

## Consequences

- Documentation changes are reviewable without building the site.
- The site build must include root `docs/` files in its input.
- MDX components remain owned by `apps/www`.
- Broken links and invalid frontmatter should fail CI once the site exists.
