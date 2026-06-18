import { describe, expect, it } from 'vitest'
import { parseTaskFile, serializeTaskFile, TaskFileError } from './taskFile.ts'

const canonicalSource = `---
id: TS-01J00000000000000000000000
title: Add deterministic task parsing
status: doing
priority: high
order: 10
createdAt: 2026-06-12
updatedAt: 2026-06-12 01:02 UTC
labels:
  - core
dependsOn: []
files:
  - packages/core/src/tasks/taskFile.ts
---

# Context

Preserve human-authored Markdown.
`

describe('parseTaskFile', () => {
	it('parses canonical metadata and Markdown body content', () => {
		const task = parseTaskFile(canonicalSource, { filePath: '.taskset/tasks/parsing.md' })

		expect(task.metadata).toEqual({
			id: 'TS-01J00000000000000000000000',
			title: 'Add deterministic task parsing',
			status: 'doing',
			priority: 'high',
			order: 10,
			createdAt: '2026-06-12',
			updatedAt: '2026-06-12 01:02 UTC',
			labels: ['core'],
			dependsOn: [],
			files: ['packages/core/src/tasks/taskFile.ts'],
		})
		expect(task.body).toBe('# Context\n\nPreserve human-authored Markdown.\n')
		expect(Object.isFrozen(task)).toBe(true)
		expect(Object.isFrozen(task.metadata)).toBe(true)
		expect(Object.isFrozen(task.metadata.labels)).toBe(true)
	})

	it('normalizes CRLF and frontmatter key order without losing Markdown', () => {
		const source = `---\r
files:\r
  - packages/core/src/tasks/taskFile.ts\r
updatedAt: 2026-06-12 01:02 UTC\r
status: doing\r
title: Add deterministic task parsing\r
id: TS-01J00000000000000000000000\r
createdAt: 2026-06-12\r
---\r
\r
# Context\r
\r
Unicode: سلام\r
`

		const task = parseTaskFile(source)

		expect(serializeTaskFile(task)).toBe(`---
id: TS-01J00000000000000000000000
title: Add deterministic task parsing
status: doing
createdAt: 2026-06-12
updatedAt: 2026-06-12 01:02 UTC
files:
  - packages/core/src/tasks/taskFile.ts
---

# Context

Unicode: سلام
`)
	})

	it.each([
		[
			'unknown fields',
			canonicalSource.replace('priority: high', 'priority: high\nblocks: []'),
			'schema',
		],
		[
			'path traversal',
			canonicalSource.replace(
				'packages/core/src/tasks/taskFile.ts',
				'../outside-the-repository.ts',
			),
			'validation',
		],
		[
			'Windows absolute paths',
			canonicalSource.replace(
				'packages/core/src/tasks/taskFile.ts',
				'C:/outside-the-repository.ts',
			),
			'validation',
		],
		[
			'self dependencies',
			canonicalSource.replace('dependsOn: []', 'dependsOn:\n  - TS-01J00000000000000000000000'),
			'validation',
		],
		[
			'duplicate list values',
			canonicalSource.replace('labels:\n  - core', 'labels:\n  - core\n  - core'),
			'schema',
		],
		[
			'an updatedAt value earlier than createdAt',
			canonicalSource.replace('updatedAt: 2026-06-12 01:02 UTC', 'updatedAt: 2026-06-11 01:02 UTC'),
			'validation',
		],
	])('rejects %s with an actionable task error', (_, source, code) => {
		try {
			parseTaskFile(source, { filePath: '.taskset/tasks/parsing.md' })
			expect.fail('Expected parsing to fail')
		} catch (error) {
			expect(error).toBeInstanceOf(TaskFileError)
			expect(error).toMatchObject({
				code,
				filePath: '.taskset/tasks/parsing.md',
			})
		}
	})

	it('maps malformed frontmatter to a task-specific error', () => {
		expect(() =>
			parseTaskFile('---\ntitle: [broken\n---\n', {
				filePath: '.taskset/tasks/broken.md',
			}),
		).toThrowError(/\.taskset\/tasks\/broken\.md/)
	})
})

describe('serializeTaskFile', () => {
	it('serializes deterministic metadata order and one final newline', () => {
		const task = parseTaskFile(canonicalSource)

		expect(serializeTaskFile(task)).toBe(canonicalSource)
		expect(serializeTaskFile(parseTaskFile(serializeTaskFile(task)))).toBe(canonicalSource)
	})

	it('round-trips an empty Markdown body', () => {
		const source = canonicalSource.replace('\n# Context\n\nPreserve human-authored Markdown.\n', '')

		expect(serializeTaskFile(parseTaskFile(source))).toBe(source)
	})

	it('round-trips full metadata in deterministic order', () => {
		const source = canonicalSource
			.replace(
				'createdAt: 2026-06-12',
				`owner: platform
assignees:
  - maintainer
reviewers:
  - reviewer
team: core
estimate: 90
effort: 3
risk: high
dueDate: 2026-06-30
createdAt: 2026-06-12`,
			)
			.replace(
				'files:',
				`related:
  - TS-01J00000000000000000000001
duplicates:
  - TS-01J00000000000000000000002
parent: TS-01J00000000000000000000003
files:`,
			)
			.replace(
				'---\n\n# Context',
				`directories:
  - packages/core
projects:
  - taskset
---

# Context`,
			)

		expect(serializeTaskFile(parseTaskFile(source))).toBe(source)
	})
})
