import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
	CONFIG_FILE_NAME,
	DOCUMENT_DIRECTORY_NAMES,
	loadRepository,
	type Repository,
	RepositoryDirectorySchema,
	resolveInitializationRoot,
} from '../config/config.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'
import { atomicWriteFileExclusive } from './atomicWrite.ts'

export { CONFIG_FILE_NAME, loadRepository, resolveInitializationRoot }

const DEFAULT_CONFIG_SOURCE = `export default {}
`
export const DEFAULT_DATA_IGNORE_SOURCE = `cache/
snapshots/
**/.generated/
**/.generated.*/
`

export interface InitializeRepositoryOptions {
	/** When true, write a minimal optional `taskset.config.ts`. Default false. */
	readonly writeConfig?: boolean
	/**
	 * When true (default), choose the repository root with
	 * {@link resolveInitializationRoot} before creating files.
	 */
	readonly resolveRoot?: boolean
}

function isExistingFile(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}

/**
 * Initializes `.taskset/` canonical directories and ignore rules without
 * requiring a config file. Existing files are left in place.
 */
export async function initializeRepository(
	rootDirectory = process.cwd(),
	options: InitializeRepositoryOptions = {},
): Promise<Repository> {
	const shouldResolveRoot = options.resolveRoot !== false
	const resolvedRoot = path.resolve(
		shouldResolveRoot
			? await resolveInitializationRoot(rootDirectory)
			: parseCoreInput(RepositoryDirectorySchema, rootDirectory, 'repository initialization'),
	)

	await mkdir(resolvedRoot, { recursive: true })

	if (options.writeConfig) {
		const configPath = path.join(resolvedRoot, CONFIG_FILE_NAME)

		try {
			await atomicWriteFileExclusive(configPath, DEFAULT_CONFIG_SOURCE)
		} catch (error) {
			if (!isExistingFile(error)) {
				throw error
			}
		}
	}

	const repository = await loadRepository(resolvedRoot)
	await mkdir(repository.tasksDirectory, { recursive: true })
	await Promise.all(
		Object.values(DOCUMENT_DIRECTORY_NAMES).map((name) =>
			mkdir(path.join(repository.documentsDirectory, name), { recursive: true }),
		),
	)

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
