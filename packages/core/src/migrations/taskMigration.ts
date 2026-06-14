import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as z from 'zod'
import type { Repository } from '../config/config.ts'
import { applyFileTransaction } from '../repository/fileTransaction.ts'
import { createSnapshot } from '../snapshots/snapshotRepository.ts'
import { serializeTaskFile } from '../tasks/taskFile.ts'
import { listTasks } from '../tasks/taskRepository.ts'

export const MigrateTasksOptionsSchema = z.strictObject({
	to: z.literal(2),
	apply: z.boolean().optional(),
	onWarning: z
		.custom<(warning: { readonly code: string; readonly message: string }) => void>(
			(value) => typeof value === 'function',
		)
		.optional(),
})
export type MigrateTasksOptions = z.infer<typeof MigrateTasksOptionsSchema>

export interface TaskMigrationChange {
	readonly taskId: string
	readonly path: string
	readonly from: 1
	readonly to: 2
}

export interface TaskMigrationResult {
	readonly applied: boolean
	readonly changes: readonly TaskMigrationChange[]
	readonly snapshotId?: string
}

/**
 * Plans schema upgrades from canonical records. Applying the plan first takes
 * an immutable snapshot, then commits every rewritten task in one transaction.
 */
export async function migrateTasks(
	repository: Repository,
	options: MigrateTasksOptions,
): Promise<TaskMigrationResult> {
	const validatedOptions = MigrateTasksOptionsSchema.parse(options)
	const records = await listTasks(repository)
	const changes = records
		.filter((record) => record.task.metadata.schemaVersion === 1)
		.map((record) =>
			Object.freeze({
				taskId: record.task.metadata.id,
				path: record.relativePath,
				from: 1 as const,
				to: 2 as const,
			}),
		)

	if (!validatedOptions.apply || changes.length === 0) {
		return Object.freeze({
			applied: false,
			changes: Object.freeze(changes),
		})
	}

	const snapshot = await createSnapshot(repository)
	const recordsByPath = new Map(records.map((record) => [record.relativePath, record]))
	const operations = await Promise.all(
		changes.map(async (change) => {
			const record = recordsByPath.get(change.path)

			if (record?.task.metadata.schemaVersion !== 1) {
				throw new Error(`Migration record disappeared: ${change.path}`)
			}

			const targetPath = path.join(repository.rootDirectory, change.path)
			const originalContents = await readFile(targetPath, 'utf8')
			const migratedTask = {
				metadata: { ...record.task.metadata, schemaVersion: 2 as const },
				body: record.task.body,
			}

			return {
				targetPath,
				contents: serializeTaskFile(migratedTask, { filePath: change.path }),
				expectedContents: originalContents,
			}
		}),
	)

	await applyFileTransaction(operations)

	try {
		const { generateViews } = await import('../generated/generatedViews.ts')
		await generateViews(repository)
	} catch (error) {
		validatedOptions.onWarning?.({
			code: 'generated-view-refresh',
			message: `Task migration succeeded, but generated views could not be refreshed: ${
				error instanceof Error ? error.message : 'unknown generation failure'
			}`,
		})
	}

	return Object.freeze({
		applied: true,
		changes: Object.freeze(changes),
		snapshotId: snapshot.id,
	})
}
