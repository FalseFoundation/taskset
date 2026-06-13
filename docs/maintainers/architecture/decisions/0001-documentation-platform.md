---
title: "ADR 0001: Documentation Platform"
description: Render canonical user documentation through the Taskset website.
---

# ADR 0001: Documentation Platform

- Status: Accepted
- Date: 2026-06-12

## Context

Taskset needs one documentation source that is readable on Git hosts and can
also power a documentation website. User guidance and repository maintenance
material have different audiences and should remain visibly separated.

## Decision

- Keep canonical user documentation in the root `docs/` directory.
- Keep contributor, product, architecture, ADR, testing, and technology
  material under `docs/maintainers/`.
- Use plain Markdown by default and MDX only for interactive pages.
- Build `apps/www` with Next.js App Router, Nextra, and the stock Nextra docs
  and blog themes.
- Expose root `docs/` as the app's Nextra `content` directory through a
  repository-relative symlink.
- Keep chronological release and project posts under `apps/www/posts/`.
- Isolate docs and blog layouts and MDX component sets by route.
- Keep the Nextra configuration and layout close to the upstream defaults.

Nextra supports App Router content-directory routing and typed `_meta.ts`
navigation:

- <https://nextra.site/docs/file-conventions/content-directory>
- <https://nextra.site/docs/docs-theme/start>

## Why

This matches the existing Next.js direction, provides navigation and search
without a custom content loader, and keeps user documentation readable in its
canonical location. Moving maintainer material into a dedicated
`docs/maintainers/` section prevents the root README and user pages from
becoming contributor handbooks.

## Implementation Contract

`apps/www/content` points to `../../docs`. Nextra's catch-all App Router page
loads that content directory directly. The app may generate `.next/`, search
data, and static output, but none of those become documentation source.

`apps/www/posts/` is the source for blog Markdown. An app-local registry maps
each post to `/posts/[slug]` so static export can enumerate routes without
copying posts into `docs/`. The global MDX component file contains only base
Nextra components; docs and blog routes apply their own theme components.

## Consequences

- Documentation changes are reviewable without building the site.
- Blog posts are reviewable as app-local Markdown without a CMS.
- The site build must include root `docs/` files in its input.
- New posts must be added to the app-local static post registry.
- MDX components remain owned by `apps/www`.
- Maintainer documentation is reviewed from `docs/maintainers/` and remains in
  its own Nextra navigation section.
- Broken links and invalid frontmatter should fail CI.
