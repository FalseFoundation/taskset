import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeRepository } from '../repository/repository.ts'
import { RepositorySyncError, syncRepository } from './repositorySync.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('syncRepository preflight', () => {
	it('aggregates actionable diagnostics and leaves canonical files unchanged', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-sync-preflight-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const taskPath = path.join(repository.tasksDirectory, '0000001-numeric-reference-abcde.md')
		const flowPath = path.join(repository.dataDirectory, 'flows', '0000001-recovered-flow-bcdef.md')
		const taskSource = `---
id: abcde
title: Numeric reference
status: todo
createdAt: 2026-10-08
updatedAt: 2026-10-08
related:
  - 12345
---

# Numeric reference
`
		const flowSource = `---
id: bcdef
title: Recovered flow
status: draft
createdAt: 2026-10-08
updatedAt: 2026-10-08
---

# Recovered flow
`
		await writeFile(taskPath, taskSource)
		await writeFile(flowPath, flowSource)

		let failure: unknown
		try {
			await syncRepository(repository)
		} catch (error) {
			failure = error
		}

		expect(failure).toBeInstanceOf(RepositorySyncError)
		expect((failure as RepositorySyncError).diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: '.taskset/tasks/0000001-numeric-reference-abcde.md',
					field: 'related[0]',
					received: 12345,
					receivedType: 'number',
					expected: 'string reference',
				}),
				expect.objectContaining({
					path: '.taskset/flows/0000001-recovered-flow-bcdef.md',
					field: 'type',
					inferredValue: 'flow',
				}),
				expect.objectContaining({
					path: '.taskset/flows/0000001-recovered-flow-bcdef.md',
					code: 'missing-template-heading',
				}),
			]),
		)
		expect(await readFile(taskPath, 'utf8')).toBe(taskSource)
		expect(await readFile(flowPath, 'utf8')).toBe(flowSource)
	})

	it('plans safe repairs without mutation, applies them atomically, and is idempotent', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-sync-fix-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const taskPath = path.join(repository.tasksDirectory, '0000001-parent-12345.md')
		const flowPath = path.join(repository.dataDirectory, 'flows', '0000001-flow-abcde.md')
		await writeFile(
			taskPath,
			`---
id: "12345"
title: Parent
status: todo
createdAt: 2026-10-08
updatedAt: 2026-10-08
---

# Parent
`,
		)
		const flowSource = `---
id: abcde
title: Flow
status: draft
createdAt: 2026-10-08
updatedAt: 2026-10-08
related:
  - 12345
---

# Flow

Related: 0000001-parent-12345.md

Port: 12345

\`\`\`
0000001-parent-12345.md
\`\`\`

External: https://example.test/0000001-parent-12345.md
`
		await writeFile(flowPath, flowSource)

		const dryRun = await syncRepository(repository, { fix: true, dryRun: true })
		expect(dryRun.applied).toBe(false)
		expect(dryRun.changes.map((change) => change.action)).toEqual(
			expect.arrayContaining(['infer-type', 'quote-reference', 'insert-heading']),
		)
		expect(await readFile(flowPath, 'utf8')).toBe(flowSource)

		const applied = await syncRepository(repository, { fix: true })
		expect(applied.applied).toBe(true)
		const flowFiles = (await readdir(path.join(repository.dataDirectory, 'flows'))).filter((name) =>
			name.endsWith('.md'),
		)
		expect(flowFiles).toHaveLength(1)
		const repaired = await readFile(
			path.join(repository.dataDirectory, 'flows', flowFiles[0] as string),
			'utf8',
		)
		expect(repaired).toContain('type: flow')
		expect(repaired).toContain('## Goal')
		expect(repaired).toContain('.taskset/tasks/0000001-parent-12345.md')
		expect(repaired).toContain('[0000001-parent-12345.md](../tasks/0000001-parent-12345.md)')
		expect(repaired).toContain('Port: 12345')
		expect(repaired).toContain('```\n0000001-parent-12345.md\n```')
		expect(repaired).toContain('https://example.test/0000001-parent-12345.md')

		const second = await syncRepository(repository, { fix: true, dryRun: true })
		expect(second.changes).toEqual([])
	})

	it('does not publish staged changes when interrupted before publication', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-sync-interrupt-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const taskPath = path.join(repository.tasksDirectory, '0000001-legacy-task.md')
		const source = `---
id: 0000001-legacy-task
title: Legacy task
status: todo
createdAt: 2026-10-08
updatedAt: 2026-10-08
---
`
		await writeFile(taskPath, source)

		await expect(
			syncRepository(repository, {
				beforePublish: () => {
					throw new Error('interrupted')
				},
			}),
		).rejects.toThrow('interrupted')
		expect(await readFile(taskPath, 'utf8')).toBe(source)
	})

	it('infers every canonical document kind but rejects a conflicting explicit type', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-sync-kinds-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const kinds = {
			stories: 'story',
			flows: 'flow',
			decisions: 'decision',
			research: 'research',
			runbooks: 'runbook',
			lessons: 'lesson',
			concerns: 'concern',
			audits: 'audit',
		} as const
		let sequence = 0
		for (const directory of Object.keys(kinds) as (keyof typeof kinds)[]) {
			sequence += 1
			const id = `a${sequence}b${sequence}c${sequence}`
			await writeFile(
				path.join(repository.dataDirectory, directory, `0000001-recovered-${id}.md`),
				`---\nid: ${id}\ntitle: Recovered\nstatus: draft\ncreatedAt: 2026-10-08\nupdatedAt: 2026-10-08\n---\n\n# Recovered\n`,
			)
		}

		const plan = await syncRepository(repository, { fix: true, dryRun: true })
		expect(plan.changes.filter((change) => change.action === 'infer-type')).toHaveLength(8)
		expect(
			plan.changes.filter((change) => change.action === 'insert-heading').length,
		).toBeGreaterThan(8)

		const conflictingPath = path.join(
			repository.dataDirectory,
			'flows',
			'0000002-conflicting-acde1.md',
		)
		await writeFile(
			conflictingPath,
			`---\nid: acde1\ntype: audit\ntitle: Conflict\nstatus: draft\ncreatedAt: 2026-10-08\nupdatedAt: 2026-10-08\n---\n`,
		)
		await expect(syncRepository(repository, { fix: true, dryRun: true })).rejects.toMatchObject({
			diagnostics: expect.arrayContaining([
				expect.objectContaining({ code: 'conflicting-document-type', expected: 'flow' }),
			]),
		})
	})
})
