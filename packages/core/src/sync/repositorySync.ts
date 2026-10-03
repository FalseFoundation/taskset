import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DOCUMENT_DIRECTORY_NAMES, type Repository, RepositorySchema } from '../config/config.ts'
import {
	type DocumentIdMigration,
	listDocuments,
	migrateDocumentIds,
} from '../documents/documentRepository.ts'
import { type GeneratedViewsResult, generateViews } from '../generated/generatedViews.ts'
import { DEFAULT_DATA_IGNORE_SOURCE } from '../repository/repository.ts'
import { listTasks, migrateTaskIds, type TaskIdMigration } from '../tasks/taskRepository.ts'
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
	readonly documentMigrations: readonly DocumentIdMigration[]
	readonly generated: GeneratedViewsResult
}

const LEGACY_DATA_IGNORE_SOURCE = `cache/
generated/
generated.*/
snapshots/
`

async function ensureDataIgnore(repository: Repository): Promise<void> {
	const ignorePath = path.join(repository.dataDirectory, '.gitignore')
	let existing: string | undefined
	try {
		existing = await readFile(ignorePath, 'utf8')
	} catch {
		await writeFile(ignorePath, DEFAULT_DATA_IGNORE_SOURCE, 'utf8')
		return
	}

	if (existing === LEGACY_DATA_IGNORE_SOURCE || existing === DEFAULT_DATA_IGNORE_SOURCE) {
		if (existing !== DEFAULT_DATA_IGNORE_SOURCE) {
			await writeFile(ignorePath, DEFAULT_DATA_IGNORE_SOURCE, 'utf8')
		}
		return
	}

	const requiredPatterns = ['**/.generated/', '**/.generated.*/']
	const lines = new Set(
		existing
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean),
	)
	let changed = false
	for (const pattern of requiredPatterns) {
		if (!lines.has(pattern)) {
			lines.add(pattern)
			changed = true
		}
	}
	if (lines.has('generated/') || lines.has('generated.*/')) {
		lines.delete('generated/')
		lines.delete('generated.*/')
		changed = true
	}
	if (changed) {
		const ordered = [
			'cache/',
			'snapshots/',
			'**/.generated/',
			'**/.generated.*/',
			...[...lines].filter(
				(line) =>
					line !== 'cache/' &&
					line !== 'snapshots/' &&
					line !== '**/.generated/' &&
					line !== '**/.generated.*/',
			),
		]
		await writeFile(ignorePath, `${ordered.join('\n')}\n`, 'utf8')
	}
}

/** Applies canonical directory, ID migration, reference, and generated-view maintenance. */
export async function syncRepository(
	repository: Repository,
	options: RepositorySyncOptions = {},
): Promise<RepositorySyncResult> {
	const validated = parseCoreInput(RepositorySchema, repository, 'repository sync')
	await Promise.all([
		mkdir(validated.tasksDirectory, { recursive: true }),
		...Object.values(DOCUMENT_DIRECTORY_NAMES).map((name) =>
			mkdir(path.join(validated.documentsDirectory, name), { recursive: true }),
		),
	])
	await ensureDataIgnore(validated)
	options.onProgress?.({ completed: 1, total: 3, percent: 33, phase: 'directories' })
	const documentIds = (await listDocuments(validated)).map((record) => record.document.metadata.id)
	const migrations = await migrateTaskIds(validated, {
		concurrency: options.concurrency,
		reservedIds: documentIds,
	})
	const taskIds = (await listTasks(validated)).map((record) => record.task.metadata.id)
	const documentMigrations = await migrateDocumentIds(validated, {
		concurrency: options.concurrency,
		reservedIds: taskIds,
	})
	options.onProgress?.({ completed: 2, total: 3, percent: 67, phase: 'migrations' })
	const generated = await generateViews(validated)
	options.onProgress?.({ completed: 3, total: 3, percent: 100, phase: 'generated' })
	return Object.freeze({ migrations, documentMigrations, generated })
}
