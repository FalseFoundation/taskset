import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDocument, updateDocument } from '../documents/documentRepository.ts'
import { initializeRepository } from '../repository/repository.ts'
import { createTask, updateTask } from '../tasks/taskRepository.ts'
import { generateViews } from './generatedViews.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('generated views', () => {
	it('refreshes only the entity scope affected by a mutation', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-generated-scopes-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		await createDocument(repository, {
			type: 'research',
			title: 'Existing research',
			body: '# Existing research\n',
		})
		const researchGeneratedDirectory = path.join(
			repository.documentsDirectory,
			'research',
			'.generated',
		)
		const unrelatedSentinel = path.join(researchGeneratedDirectory, 'unrelated-sentinel.md')
		await writeFile(unrelatedSentinel, 'preserve me\n')

		await createTask(repository, { title: 'Task-only mutation' })

		expect(await readFile(unrelatedSentinel, 'utf8')).toBe('preserve me\n')
	})

	it('skips unchanged metadata scopes for body-only edits', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-generated-noop-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const task = await createTask(repository, { title: 'Body task', body: 'Before' })
		const document = await createDocument(repository, {
			type: 'research',
			title: 'Body research',
			body: '# Before\n',
		})
		const taskSentinel = path.join(repository.generatedDirectory, 'task-sentinel.md')
		const documentSentinel = path.join(
			repository.documentsDirectory,
			'research',
			'.generated',
			'document-sentinel.md',
		)
		await writeFile(taskSentinel, 'task\n')
		await writeFile(documentSentinel, 'document\n')

		await updateTask(repository, task.task.metadata.id, { body: 'After' })
		await updateDocument(repository, document.document.metadata.id, { body: '# After\n' })

		expect(await readFile(taskSentinel, 'utf8')).toBe('task\n')
		expect(await readFile(documentSentinel, 'utf8')).toBe('document\n')
	})

	it('is deterministic, versionless, and replaces stale generated output', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-generated-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const taskId = 'a1b2c3'
		const created = await createTask(
			repository,
			{
				title: 'Indexed',
				order: 20,
				priority: 'high',
				assignees: ['maintainer'],
				projects: ['alpha/beta'],
			},
			{
				createId: () => taskId,
				now: () => new Date('2026-06-12T00:00:00.000Z'),
			},
		)
		const stalePath = path.join(repository.generatedDirectory, 'status', 'stale.md')
		await writeFile(stalePath, 'stale\n')

		const first = await generateViews(repository)
		const second = await generateViews(repository)
		const manifest = JSON.parse(
			await readFile(path.join(repository.generatedDirectory, 'manifest.json'), 'utf8'),
		) as Record<string, unknown>
		const fileName = path.basename(created.relativePath)

		expect(second.fingerprint).toBe(first.fingerprint)
		expect(Object.keys(manifest).sort()).toEqual(['files', 'fingerprint'])
		expect(
			await readFile(path.join(repository.generatedDirectory, 'status', 'todo.md'), 'utf8'),
		).toContain(`- [20] [${fileName}: Indexed](../${fileName})`)
		expect(
			await readFile(path.join(repository.generatedDirectory, 'projects', 'alpha∕beta.md'), 'utf8'),
		).toContain(taskId)
		await expect(access(stalePath)).rejects.toThrow()
	})

	it('generates indexes for every supported task metadata field', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-generated-metadata-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const taskId = 'TS-01J00000000000000000000000'
		await writeFile(
			path.join(repository.tasksDirectory, `${taskId}.md`),
			`---
id: ${taskId}
title: Full metadata
status: doing
priority: urgent
order: 10
owner: platform
assignees:
  - maintainer
reviewers:
  - reviewer
team: core
estimate: 90
effort: 3
risk: high
dueDate: 2026-06-30
createdAt: 2026-06-12
updatedAt: 2026-06-12 01:02 UTC
labels:
  - core
dependsOn:
  - TS-01J00000000000000000000001
related:
  - TS-01J00000000000000000000002
duplicates:
  - TS-01J00000000000000000000003
parent: TS-01J00000000000000000000004
files:
  - packages/core/src/generated/generatedViews.ts
directories:
  - packages/core
projects:
  - taskset
---

Body.
`,
		)
		await mkdir(repository.generatedDirectory, { recursive: true })

		const result = await generateViews(repository)

		expect(result.files).toEqual([
			'tasks/assignees/maintainer.md',
			'tasks/createdAt/2026-06-12.md',
			'tasks/dependsOn/TS-01J00000000000000000000001.md',
			'tasks/directories/packages∕core.md',
			'tasks/dueDate/2026-06-30.md',
			'tasks/duplicates/TS-01J00000000000000000000003.md',
			'tasks/effort/3.md',
			'tasks/estimate/90.md',
			'tasks/files/packages∕core∕src∕generated∕generatedViews.ts.md',
			'tasks/labels/core.md',
			'tasks/order/10.md',
			'tasks/owner/platform.md',
			'tasks/parent/TS-01J00000000000000000000004.md',
			'tasks/priority/urgent.md',
			'tasks/projects/taskset.md',
			'tasks/related/TS-01J00000000000000000000002.md',
			'tasks/reviewers/reviewer.md',
			'tasks/risk/high.md',
			'tasks/status/doing.md',
			'tasks/team/core.md',
			'tasks/title/Full metadata.md',
			'tasks/updatedAt/2026-06-12.md',
		])
	})
})
