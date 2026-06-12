# @taskset/core

The reusable domain and repository engine for Taskset.

It owns configuration discovery, task parsing and validation, deterministic
serialization, atomic filesystem writes, repository initialization, and task
creation and queries. Interfaces consume its public exports instead of
reimplementing these rules.

Initialization creates canonical task storage and a nested `.taskset/.gitignore`
for disposable cache and generated directories.
