---
title: "ADR 0001: Documentation Platform"
description: Render canonical documentation through the Taskset website for humans, agents, and maintainers.
---

# ADR 0001: Documentation Platform

- Status: Accepted
- Date: 2026-06-12
- Updated: 2026-10-03

## Context

Taskset needs one documentation source that is readable on Git hosts and can also power a documentation website. Human usage guidance, agent operating contracts, and repository maintenance material have different audiences and should remain visibly separated.

## Decision

- Keep canonical documentation in the root `docs/` directory
- Keep human usage pages at the top level of `docs/`
- Keep agent operating guidance under `docs/agents/`, with root `AGENTS.md` and packaged `skills/` as offline entrypoints
- Keep contributor, product, architecture, ADR, testing, and technology material under `docs/maintainers/`
- Publish an agent discovery index at `docs/agents/llms.txt` and mirror it from the website when practical
- Use plain Markdown by default and MDX only for interactive pages
- Build `apps/www` with Next.js App Router, Nextra, and the stock Nextra docs and blog themes
- Expose root `docs/` as the app’s Nextra `content` directory through a repository-relative symlink
- Render top-level usage docs (including `docs/agents/`) and `docs/maintainers/` through separate route layouts and page maps
- Keep chronological release and project posts under `apps/www/posts/`
- Follow the [Vercel writing guidelines](https://github.com/vercel-labs/writing-guidelines) for public prose voice and structure

## Why

This keeps one Markdown source of truth while matching how agent-first tools expose denser contracts beside human onboarding. Maintainer material stays out of the primary product navigation. Agent pages and `llms.txt` give coding agents a short index without inventing a second product truth.

## Implementation Contract

`apps/www/content` points to `../../docs`. The usage docs catch-all route loads top-level content, including `docs/agents/`, and excludes `docs/maintainers/` from its page map. The `/maintainers` route loads the same content directory with a maintainer-rooted page map. Root `AGENTS.md` is repository-local agent guidance and may be linked from docs, but docs remain canonical for published pages.

## Consequences

- Documentation changes are reviewable without building the site
- Blog posts are reviewable as app-local Markdown without a CMS
- New agent pages belong under `docs/agents/` and appear in usage navigation
- Maintainer documentation remains in its own `/maintainers` navigation section
- Broken links and invalid frontmatter should fail CI
