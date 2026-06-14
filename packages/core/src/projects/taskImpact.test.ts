import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeRepository } from '../repository/repository.ts'
import { createTask } from '../tasks/taskRepository.ts'
import { normalizeRepositoryPath, RepositoryPathError, tasksForFile } from './taskImpact.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('task impact', () => {
	it('matches files and directories and includes dependent task impact', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-impact-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const first = 'TS-01J00000000000000000000000'
		const second = 'TS-01J00000000000000000000001'
		const now = () => new Date('2026-06-12T00:00:00.000Z')
		await createTask(
			repository,
			{ title: 'Core file', files: ['packages/core/src/index.ts'] },
			{ createId: () => first, now },
		)
		await createTask(
			repository,
			{ title: 'CLI impact', dependsOn: [first], files: ['packages/cli'] },
			{ createId: () => second, now },
		)

		const result = await tasksForFile(repository, 'packages/core', { includeImpact: true })

		expect(result.direct.map((record) => record.task.metadata.id)).toEqual([first])
		expect(result.impacted.map((record) => record.task.metadata.id)).toEqual([second])
		expect((await tasksForFile(repository, 'missing')).direct).toEqual([])
	})

	it('rejects paths outside the repository and ambiguous normalization', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-impact-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)

		expect(() => normalizeRepositoryPath(repository, '../outside')).toThrow(RepositoryPathError)
		expect(() => normalizeRepositoryPath(repository, path.dirname(rootDirectory))).toThrow(
			RepositoryPathError,
		)
	})
})
