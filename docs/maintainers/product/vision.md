---
title: Product Vision
description: Maintainer-facing product direction for Taskset.
---

# Product Vision

## Origin

Taskset began from a simple need: keep task context offline and inline with the
code so developers and AI assistants can understand work immediately without
switching to a disconnected project-management database.

## Vision

Taskset aims to become the Git-native operating system for software delivery.

## Mission

Store planning, execution, and project knowledge as human-readable repository
files, then provide focused interfaces over that shared task graph.

## Product Goals

- Accelerate delivery by reducing context switching.
- Give developers immediate awareness of related tasks, dependencies, specs,
  decisions, and releases.
- Give AI systems direct, structured, reviewable project context.
- Make monorepos, packages, applications, and code paths first-class.
- Let managers and stakeholders view repository-backed information without
  creating another source of truth.

## Principles

### Offline first

Core workflows must work from a local repository without a network service.

### Inline with code

Project context belongs beside the code it affects and travels with the
repository.

### Human and AI readable

Markdown carries durable prose. Structured frontmatter carries data that tools
can validate and query.

### Git native

Commits, branches, pull requests, diffs, and reviews are normal collaboration
mechanisms.

### One source of truth

Every interface reads and changes the same canonical `.taskset/` files through
the same domain rules.

### Developer first

Taskset proves developer workflows before broad enterprise planning features.

## Near-Term Scope

The MVP should implement:

- repository initialization
- task creation, listing, display, editing, and removal
- lifecycle transitions
- deterministic Markdown parsing and serialization
- validation and repository diagnostics
- basic search and filtering
- dependency integrity

TUI, MCP, extension, Kanban, Office, and integrations follow after the file and
core contracts are reliable.
