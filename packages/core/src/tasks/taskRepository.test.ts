import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeRepository } from '../repository/repository.ts'
import {
	createTask,
	deleteTask,
	generateTaskId,
	listTasks,
	readTask,
	TaskRepositoryError,
	updateTask,
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
	it('keeps canonical CRUD successful when generated view refreshes fail', async () => {
		const rootDirectory = await createTemporaryDirectory()
		const repository = await initializeRepository(rootDirectory)
		const failureRepository = Object.freeze({
			...repository,
			generatedDirectory: path.join(repository.dataDirectory, 'missing', 'generated'),
		})
		const warnings: string[] = []
		const options = {
			onWarning: (warning: { readonly message: string }) => warnings.push(warning.message),
		}

		const created = await createTask(
			failureRepository,
			{ title: 'Warning task' },
			{ ...options, createId: () => 'TS-01J00000000000000000000009' },
		)
		const updated = await updateTask(
			failureRepository,
			created.task.metadata.id,
			{ title: 'Updated' },
			options,
		)
		const deleted = await deleteTask(failureRepository, updated.task.metadata.id, options)

		expect(updated.task.metadata.title).toBe('Updated')
		expect(deleted.task.metadata.id).toBe(created.task.metadata.id)
		expect(warnings).toHaveLength(3)
		expect(
			warnings.every((warning) => warning.includes('generated views could not be refreshed')),
		).toBe(true)
	})

	it('creates, lists, and reads canonical task files using config defaults', async () => {
		const rootDirectory = await createTemporaryDirectory()
		const repository = await initializeRepository(rootDirectory)
		await writeFile(
			repository.configPath,
			`export default {
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

	it('rejects statuses that are disabled by repository configuration', async () => {
		const rootDirectory = await createTemporaryDirectory()
		const repository = await initializeRepository(rootDirectory)
		await writeFile(
			repository.configPath,
			`export default {
	tasks: {
		statuses: ['todo', 'doing'],
	},
}
`,
		)
		const configuredRepository = await initializeRepository(rootDirectory)
		const id = 'TS-01J00000000000000000000000'

		await expect(
			createTask(configuredRepository, {
				title: 'Use a disabled status',
				status: 'blocked',
			}),
		).rejects.toMatchObject({
			code: 'task-invalid',
			message: 'Status "blocked" is not enabled by taskset.config.ts',
		})

		await createTask(
			configuredRepository,
			{ title: 'Allowed status', status: 'doing' },
			{ createId: () => id },
		)
		await expect(updateTask(configuredRepository, id, { status: 'blocked' })).rejects.toMatchObject(
			{
				code: 'task-invalid',
				message: 'Status "blocked" is not enabled by taskset.config.ts',
			},
		)
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

	it('updates task metadata and body atomically while enforcing lifecycle transitions', async () => {
		const rootDirectory = await createTemporaryDirectory()
		const repository = await initializeRepository(rootDirectory)
		const id = 'TS-01J00000000000000000000000'
		await createTask(
			repository,
			{ title: 'Original', body: '# Context\n\nKeep this.\n' },
			{
				createId: () => id,
				now: () => new Date('2026-06-12T00:00:00.000Z'),
			},
		)

		const updated = await updateTask(
			repository,
			id,
			{ title: 'Updated', status: 'doing', labels: ['core'] },
			{ now: () => new Date('2026-06-12T01:00:00.000Z') },
		)

		expect(updated.task).toMatchObject({
			metadata: {
				title: 'Updated',
				status: 'doing',
				updatedAt: '2026-06-12 01:00 UTC',
				labels: ['core'],
			},
			body: '# Context\n\nKeep this.\n',
		})

		await updateTask(repository, id, { status: 'done' })
		await expect(updateTask(repository, id, { status: 'doing' })).rejects.toMatchObject({
			code: 'task-transition-invalid',
		})
	})

	it('validates relationship changes and blocks deletion with inbound dependencies', async () => {
		const rootDirectory = await createTemporaryDirectory()
		const repository = await initializeRepository(rootDirectory)
		const first = 'TS-01J00000000000000000000000'
		const second = 'TS-01J00000000000000000000001'
		const options = {
			now: () => new Date('2026-06-12T00:00:00.000Z'),
		}
		await createTask(repository, { title: 'First' }, { ...options, createId: () => first })
		await createTask(
			repository,
			{ title: 'Second', dependsOn: [first] },
			{ ...options, createId: () => second },
		)

		await expect(updateTask(repository, first, { dependsOn: [second] })).rejects.toMatchObject({
			code: 'task-invalid',
		})
		await expect(deleteTask(repository, first)).rejects.toMatchObject({
			code: 'task-dependency-blocked',
		})

		const deleted = await deleteTask(repository, first, {
			removeDependencies: true,
			now: () => new Date('2026-06-12T02:00:00.000Z'),
		})
		expect(deleted.task.metadata.id).toBe(first)
		await expect(access(path.join(repository.tasksDirectory, `${first}.md`))).rejects.toThrow()
		expect((await readTask(repository, second)).task.metadata.dependsOn).toEqual([])
	})
})
