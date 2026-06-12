import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeRepository } from '../repository/repository.ts'
import {
	createTask,
	generateTaskId,
	listTasks,
	readTask,
	TaskRepositoryError,
} from './taskRepository.ts'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), 'taskset-tasks-'))
	temporaryDirectories.push(directory)
	return directory
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('generateTaskId', () => {
	it('encodes the timestamp and random bytes as a branch-safe ULID', () => {
		expect(generateTaskId(new Date('2026-06-12T00:00:00.000Z'), () => new Uint8Array(10))).toMatch(
			/^TS-[0-9A-HJKMNP-TV-Z]{26}$/u,
		)
	})
})

describe('task repository', () => {
	it('creates, lists, and reads canonical task files using config defaults', async () => {
		const rootDirectory = await createTemporaryDirectory()
		const repository = await initializeRepository(rootDirectory)
		await writeFile(
			repository.configPath,
			`export default {
	schemaVersion: 1,
	tasks: {
		defaults: {
			priority: 'high',
			labels: ['fixture'],
		},
		priorities: ['low', 'medium', 'high', 'urgent'],
	},
}
`,
		)
		const configuredRepository = await initializeRepository(rootDirectory)
		const id = 'TS-01J00000000000000000000000'

		const created = await createTask(
			configuredRepository,
			{
				title: 'Use Taskset inside Taskset',
				body: '# Context\n\nDogfood the repository workflow.\n',
				files: ['taskset.config.ts'],
			},
			{
				createId: () => id,
				now: () => new Date('2026-06-12T00:00:00.000Z'),
			},
		)

		expect(created.relativePath).toBe(`.taskset/tasks/${id}.md`)
		expect(created.task.metadata).toMatchObject({
			id,
			status: 'todo',
			priority: 'high',
			labels: ['fixture'],
		})
		expect(await listTasks(configuredRepository)).toEqual([created])
		expect(await readTask(configuredRepository, id)).toEqual(created)
		expect(await readFile(path.join(rootDirectory, created.relativePath), 'utf8')).toContain(
			'title: Use Taskset inside Taskset',
		)
	})

	it('does not overwrite an existing task ID', async () => {
		const rootDirectory = await createTemporaryDirectory()
		const repository = await initializeRepository(rootDirectory)
		const id = 'TS-01J00000000000000000000000'
		const options = {
			createId: () => id,
			now: () => new Date('2026-06-12T00:00:00.000Z'),
		}

		await createTask(repository, { title: 'First task' }, options)

		await expect(createTask(repository, { title: 'Second task' }, options)).rejects.toMatchObject({
			code: 'task-exists',
			taskId: id,
		})
	})

	it('rejects priorities that are disabled by repository configuration', async () => {
		const rootDirectory = await createTemporaryDirectory()
		const repository = await initializeRepository(rootDirectory)
		await writeFile(
			repository.configPath,
			`export default {
	schemaVersion: 1,
	tasks: {
		priorities: ['low', 'high'],
	},
}
`,
		)
		const configuredRepository = await initializeRepository(rootDirectory)

		await expect(
			createTask(configuredRepository, {
				title: 'Use a disabled priority',
				priority: 'urgent',
			}),
		).rejects.toMatchObject({
			code: 'task-invalid',
			message: 'Priority "urgent" is not enabled by taskset.config.ts',
		})
	})

	it('reports malformed canonical files during listing', async () => {
		const rootDirectory = await createTemporaryDirectory()
		const repository = await initializeRepository(rootDirectory)
		await writeFile(path.join(repository.tasksDirectory, 'broken.md'), 'not frontmatter\n')

		await expect(listTasks(repository)).rejects.toBeInstanceOf(TaskRepositoryError)
		await expect(listTasks(repository)).rejects.toMatchObject({
			code: 'task-invalid',
		})
	})
})
