---
title: Product Vision
description: Maintainer-facing product direction for Taskset.
---

# Product Vision

## Origin

Taskset began from a need to keep delivery context offline and inline with the code. Tasks alone were not enough. Teams and agents also needed stories, research, decisions, flows, and runbooks that travel with the repository instead of living in a disconnected project-management database.

## Vision

Taskset aims to become the Git-native operating system for software delivery.

## Mission

Store planning, learning, decisions, operations, and execution as human-readable repository files, then provide focused interfaces over that shared work graph.

## Product Goals

- Accelerate delivery by reducing context switching
- Give developers immediate awareness of related tasks, dependencies, specs, decisions, and releases
- Give AI systems direct, structured, reviewable project context across plans and execution
- Make monorepos, packages, applications, and code paths first-class
- Let managers and stakeholders view repository-backed information without creating another source of truth

## Principles

### Offline first

Core workflows must work from a local repository without a network service.

### Inline with code

Project context belongs beside the code it affects and travels with the repository.

### Human and AI readable

Markdown carries durable prose. Structured frontmatter carries data that tools can validate and query.

### Git native

Commits, branches, pull requests, diffs, and reviews are normal collaboration mechanisms.

### One source of truth

Every interface reads and changes the same canonical `.taskset/` files through the same domain rules.

### Agent first, human readable

Taskset optimizes distribution, discovery, and docs for agent operators while keeping Markdown reviewable by humans.

### Memory and execution together

Documents preserve product and engineering memory. Tasks carry ownership, status, and delivery. Relationships bind them into one graph.

## Current product surface

The current surface includes:

- repository initialization and optional configuration
- tasks with lifecycle, dependencies, search, and impact queries
- stories, flows, decisions, research, and runbooks with the same query and mutation family
- validation, diagnostics, generated views, snapshots, and sync
- packaged agent skills and dual-audience documentation

TUI, MCP, extension, Kanban, Office, and integrations build on the same file and core contracts.
