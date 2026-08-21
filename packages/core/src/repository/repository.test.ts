import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CONFIG_FILE_NAME, initializeRepository, loadRepository } from './repository.ts'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), 'taskset-repository-'))
	temporaryDirectories.push(directory)
	return directory
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('initializeRepository', () => {
	it('creates a default config, task directory, and derived-state ignore file', async () => {
		const rootDirectory = await createTemporaryDirectory()

		const repository = await initializeRepository(rootDirectory)

		expect(await readFile(path.join(rootDirectory, CONFIG_FILE_NAME), 'utf8')).toBe(
			`export default {}
`,
		)
		await expect(access(repository.tasksDirectory)).resolves.toBeUndefined()
		expect(await readFile(path.join(repository.dataDirectory, '.gitignore'), 'utf8')).toBe(
			'cache/\ngenerated/\nsnapshots/\n',
		)
		expect((await loadRepository(rootDirectory)).rootDirectory).toBe(rootDirectory)
	})

	it('is idempotent and preserves existing repository-owned files', async () => {
		const rootDirectory = await createTemporaryDirectory()
		await initializeRepository(rootDirectory)
		const configPath = path.join(rootDirectory, CONFIG_FILE_NAME)
		const ignorePath = path.join(rootDirectory, '.taskset', '.gitignore')
		const originalConfig = await readFile(configPath, 'utf8')
		await writeFile(ignorePath, 'cache/\ngenerated/\nlocal-export/\n')

		await initializeRepository(rootDirectory)

		expect(await readFile(configPath, 'utf8')).toBe(originalConfig)
		expect(await readFile(ignorePath, 'utf8')).toBe('cache/\ngenerated/\nlocal-export/\n')
	})
})
