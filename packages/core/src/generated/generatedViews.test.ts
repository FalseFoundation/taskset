import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeRepository } from '../repository/repository.ts'
import { createTask } from '../tasks/taskRepository.ts'
import { generateViews } from './generatedViews.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('generated views', () => {
	it('is deterministic, versionless, and replaces stale generated output', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-generated-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const taskId = 'TS-01J00000000000000000000000'
		await createTask(
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

		expect(second.fingerprint).toBe(first.fingerprint)
		expect(Object.keys(manifest).sort()).toEqual(['files', 'fingerprint'])
		expect(
			await readFile(path.join(repository.generatedDirectory, 'status', 'todo.md'), 'utf8'),
		).toContain(`- [20] [${taskId}: Indexed](../../tasks/${taskId}.md)`)
		expect(
			await readFile(
				path.join(repository.generatedDirectory, 'projects', 'alpha%2Fbeta.md'),
				'utf8',
			),
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
			'assignees/maintainer.md',
			'createdAt/2026-06-12.md',
			'dependsOn/TS-01J00000000000000000000001.md',
			'directories/packages%2Fcore.md',
			'dueDate/2026-06-30.md',
			'duplicates/TS-01J00000000000000000000003.md',
			'effort/3.md',
			'estimate/90.md',
			'files/packages%2Fcore%2Fsrc%2Fgenerated%2FgeneratedViews.ts.md',
			'id/TS-01J00000000000000000000000.md',
			'labels/core.md',
			'order/10.md',
			'owner/platform.md',
			'parent/TS-01J00000000000000000000004.md',
			'priority/urgent.md',
			'projects/taskset.md',
			'related/TS-01J00000000000000000000002.md',
			'reviewers/reviewer.md',
			'risk/high.md',
			'status/doing.md',
			'team/core.md',
			'title/Full%20metadata.md',
			'updatedAt/2026-06-12%2001%3A02%20UTC.md',
		])
	})
})
