# Taskset Documentation

This directory is the canonical source for Taskset product and contributor
documentation.

## Structure

```text
docs/
├── index.md
├── product/
├── concepts/
├── architecture/
│   └── decisions/
└── development/
```

- `product/`: vision, mission, scope, and roadmap-level intent
- `concepts/`: user-facing mental models and persisted formats
- `architecture/`: system boundaries and accepted decisions
- `development/`: contributor workflows and engineering practices

## Authoring

- Write plain Markdown by default.
- Use YAML frontmatter with at least `title` and `description`.
- Use repository-relative links.
- Mark planned behavior clearly; do not document unimplemented commands as
  available.
- Keep examples deterministic and compatible with the canonical file format.
- Update `skills/standards/` when documentation changes an architecture or
  workflow rule.

`apps/www` will render this directory directly using Next.js and Fumadocs MDX.
Do not copy these files into the app. See
[development/documentation.md](development/documentation.md).
