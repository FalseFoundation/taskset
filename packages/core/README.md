# @taskset/core

The public, reusable domain and repository engine for Taskset.

It owns configuration discovery, task parsing and validation, deterministic
serialization, failure-safe filesystem writes, task CRUD and lifecycle policy,
dependency graphs, search, diagnostics, file impact, disposable indexing, and
provider-neutral synchronization planning. Interfaces consume its public
exports instead of reimplementing these rules.

Initialization creates canonical task storage and a nested `.taskset/.gitignore`
for disposable cache and generated directories.
