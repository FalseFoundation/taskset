import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { DOCUMENT_DIRECTORY_NAMES, type Repository, RepositorySchema } from '../config/config.ts'
import { type GeneratedViewsResult, generateViews } from '../generated/generatedViews.ts'
import { migrateTaskIds, type TaskIdMigration } from '../tasks/taskRepository.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

export interface RepositorySyncProgress {
	readonly completed: number
	readonly total: number
	readonly percent: number
	readonly phase: 'directories' | 'migrations' | 'generated'
}

export interface RepositorySyncOptions {
	readonly concurrency?: number
	readonly onProgress?: (progress: RepositorySyncProgress) => void
}

export interface RepositorySyncResult {
	readonly migrations: readonly TaskIdMigration[]
	readonly generated: GeneratedViewsResult
}

/** Applies canonical directory, ID migration, reference, and generated-view maintenance. */
export async function syncRepository(
	repository: Repository,
	options: RepositorySyncOptions = {},
): Promise<RepositorySyncResult> {
	const validated = parseCoreInput(RepositorySchema, repository, 'repository sync')
	await Promise.all(
		Object.values(DOCUMENT_DIRECTORY_NAMES).map((name) =>
			mkdir(path.join(validated.documentsDirectory, name), { recursive: true }),
		),
	)
	options.onProgress?.({ completed: 1, total: 3, percent: 33, phase: 'directories' })
	const migrations = await migrateTaskIds(validated, { concurrency: options.concurrency })
	options.onProgress?.({ completed: 2, total: 3, percent: 67, phase: 'migrations' })
	const generated = await generateViews(validated)
	options.onProgress?.({ completed: 3, total: 3, percent: 100, phase: 'generated' })
	return Object.freeze({ migrations, generated })
}
