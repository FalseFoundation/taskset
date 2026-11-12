---
id: 8a7ed4
type: research
title: Large-repository mutation performance
status: accepted
owner: junkieshuffle
createdAt: 2026-11-12 11:36 UTC
updatedAt: 2026-11-12 11:46 UTC
related:
  - .taskset/tasks/0000051-make-large-repository-mutations-and-queries-linear-time-78a33d.md
  - .taskset/tasks/0000052-skip-unchanged-generated-view-rebuilds-f7e04d.md
directories:
  - packages/core/src
---

# Large-repository mutation performance

## Question

Why does one task mutation consume substantial CPU in repositories with many tasks and documents, and how can creation, editing, and querying avoid duplicated repository-wide work while keeping Markdown canonical?

## Sources

- `packages/core/src/tasks/taskRepository.ts`: task list, normalization, create, update, graph validation, and refresh paths.
- `packages/core/src/documents/documentRepository.ts`: document list, create, update, and refresh paths.
- `packages/core/src/generated/generatedViews.ts`: metadata grouping, sorting, hashing, and atomic scope swaps.
- `packages/core/src/search/taskQuery.ts`: query scan and deterministic result sorting.
- Controlled local fixture with 1,000 tasks and 1,000 research documents.

## Findings

A task mutation previously performed duplicated repository-wide work:

1. `createTask` or `updateTask` parsed and normalized every task.
2. Relationship resolution parsed every document.
3. Graph validation scanned the task set.
4. Generated-view refresh parsed every task and document again.
5. The refresh rebuilt task views plus all eight document-kind views, even when only one task changed.

`listTasks` also normalized every already-parsed task through a Markdown serialize-and-parse round trip. Every task query paid that cost before applying its linear filter.

The dominant cost was therefore not writing one Markdown file. It was repeated parsing, sorting, hashing, and generated-file I/O across unrelated collections. The exact bound includes deterministic sorts, so mutation/view generation is generally O(n log n), not strict O(n); the important correction is eliminating duplicated full scans and bounding refresh work to the affected collection.

The controlled fixture measured task query at 211 ms before and 149 ms after, and task creation at 732 ms before and 384 ms after. These timings are local evidence rather than CI thresholds.

## Recommendation

Retain validated task/document records along mutation paths and pass them to a scoped generated-view refresher. Task create/update should refresh only task views. Document create/update should refresh only the mutated document-kind view. Explicit `generate`, `sync`, migrations, and conservative delete/repair paths should retain full rebuild behavior.

Validate normalized task objects directly instead of serializing them to Markdown and parsing them again. Keep canonical Markdown authoritative, generated views disposable and atomically swapped, and refresh failures non-fatal with warnings.

## Open questions

- A future persistent read-through index could reduce repeated YAML parsing across separate CLI processes, but it needs a robust filesystem-change signature and corruption recovery contract.
- Incremental per-group generated-view updates could reduce the remaining task-scope rewrite cost, but would add more transactional complexity than the scoped full-tree swap.
