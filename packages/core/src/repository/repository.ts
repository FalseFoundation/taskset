import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { CONFIG_FILE_NAME, loadRepository, type Repository } from '../config/config.ts'
import { atomicWriteFileExclusive } from './atomicWrite.ts'

export { CONFIG_FILE_NAME, loadRepository }

const DEFAULT_CONFIG_SOURCE = `export default {
	schemaVersion: 1,
}
`
const DEFAULT_DATA_IGNORE_SOURCE = `cache/
generated/
snapshots/
`

function isExistingFile(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}

export async function initializeRepository(rootDirectory = process.cwd()): Promise<Repository> {
	const resolvedRoot = path.resolve(rootDirectory)
	const configPath = path.join(resolvedRoot, CONFIG_FILE_NAME)

	await mkdir(resolvedRoot, { recursive: true })

	try {
		await atomicWriteFileExclusive(configPath, DEFAULT_CONFIG_SOURCE)
	} catch (error) {
		if (!isExistingFile(error)) {
			throw error
		}
	}

	const repository = await loadRepository(resolvedRoot)
	await mkdir(repository.tasksDirectory, { recursive: true })

	try {
		await atomicWriteFileExclusive(
			path.join(repository.dataDirectory, '.gitignore'),
			DEFAULT_DATA_IGNORE_SOURCE,
		)
	} catch (error) {
		if (!isExistingFile(error)) {
			throw error
		}
	}

	return repository
}
