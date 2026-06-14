import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeRepository } from '../repository/repository.ts'
import { createTask } from '../tasks/taskRepository.ts'
import { buildTaskIndex } from './taskIndex.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('task index', () => {
	it('rebuilds equivalent results after cache deletion or corruption', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-index-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		await createTask(
			repository,
			{ title: 'Indexed task', labels: ['index'] },
			{
				createId: () => 'TS-01J00000000000000000000000',
				now: () => new Date('2026-06-12T00:00:00.000Z'),
			},
		)
		const first = await buildTaskIndex(repository, { cache: true })
		const cachePath = path.join(repository.dataDirectory, 'cache', 'task-index-v1.json')
		await writeFile(cachePath, '{broken')
		const rebuilt = await buildTaskIndex(repository, { cache: true })
		await rm(path.dirname(cachePath), { recursive: true })
		const withoutCache = await buildTaskIndex(repository)

		expect(rebuilt.fingerprint).toBe(first.fingerprint)
		expect(withoutCache.query({ labels: ['index'] })).toEqual(first.query({ labels: ['index'] }))
	})
})
