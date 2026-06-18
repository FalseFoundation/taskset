import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
	it('is deterministic and replaces stale generated output', async () => {
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

		expect(second.fingerprint).toBe(first.fingerprint)
		expect(
			await readFile(path.join(repository.generatedDirectory, 'status', 'todo.md'), 'utf8'),
		).toContain(`- [20] [${taskId}: Indexed](../../tasks/${taskId}.md)`)
		expect(
			await readFile(
				path.join(repository.generatedDirectory, 'project', 'alpha%2Fbeta.md'),
				'utf8',
			),
		).toContain(taskId)
		await expect(access(stalePath)).rejects.toThrow()
	})
})
