import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
	CONFIG_FILE_NAME,
	ConfigError,
	defineConfig,
	discoverRepository,
	loadRepository,
} from './config.ts'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), 'taskset-config-'))
	temporaryDirectories.push(directory)
	return directory
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('defineConfig', () => {
	it('validates configuration at authoring time', () => {
		const config = defineConfig({
			project: { name: 'taskset' },
		})

		expect(config).toEqual({
			project: { name: 'taskset' },
		})
		expect(Object.isFrozen(config)).toBe(true)
	})
})

describe('taskset.config.ts loading', () => {
	it('discovers the repository upward and applies task defaults', async () => {
		const rootDirectory = await createTemporaryDirectory()
		const nestedDirectory = path.join(rootDirectory, 'packages', 'core', 'src')
		await mkdir(nestedDirectory, { recursive: true })
		await writeFile(
			path.join(rootDirectory, CONFIG_FILE_NAME),
			`const config: object = {
	project: { name: 'fixture' },
	tasks: {
		defaults: {
			priority: 'high',
			labels: ['fixture'],
		},
	},
}

export default config
`,
		)

		const repository = await discoverRepository(nestedDirectory)

		expect(repository.rootDirectory).toBe(rootDirectory)
		expect(repository.configPath).toBe(path.join(rootDirectory, CONFIG_FILE_NAME))
		expect(repository.dataDirectory).toBe(path.join(rootDirectory, '.taskset'))
		expect(repository.tasksDirectory).toBe(path.join(rootDirectory, '.taskset', 'tasks'))
		expect(repository.config).toEqual({
			project: { name: 'fixture' },
			tasks: {
				defaults: {
					status: 'todo',
					priority: 'high',
					labels: ['fixture'],
				},
				statuses: ['todo', 'doing', 'blocked', 'done', 'canceled'],
				priorities: ['low', 'medium', 'high', 'urgent'],
			},
		})
	})

	it('resolves configured status ordering and validates defaults', async () => {
		const rootDirectory = await createTemporaryDirectory()
		await writeFile(
			path.join(rootDirectory, CONFIG_FILE_NAME),
			`export default {
	tasks: {
		defaults: {
			status: 'doing',
		},
		statuses: ['doing', 'todo'],
	},
}
`,
		)

		const repository = await loadRepository(rootDirectory)

		expect(repository.config.tasks.statuses).toEqual(['doing', 'todo'])
		expect(repository.config.tasks.defaults.status).toBe('doing')
	})

	it('rejects an invalid default export with the config path', async () => {
		const rootDirectory = await createTemporaryDirectory()
		const configPath = path.join(rootDirectory, CONFIG_FILE_NAME)
		await writeFile(configPath, 'export default { storage: ".taskset" }\n')

		await expect(loadRepository(rootDirectory)).rejects.toMatchObject({
			code: 'config-schema',
			configPath,
		})
	})

	it('reports when no repository config can be discovered', async () => {
		const rootDirectory = await createTemporaryDirectory()

		await expect(discoverRepository(rootDirectory)).rejects.toBeInstanceOf(ConfigError)
		await expect(discoverRepository(rootDirectory)).rejects.toMatchObject({
			code: 'config-not-found',
		})
	})
})
