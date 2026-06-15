import { randomUUID } from 'node:crypto'
import { link, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as z from 'zod'
import { parseCoreInput } from '../validation/coreValidation.ts'

export interface FileTransactionOperation {
	readonly targetPath: string
	readonly contents: string | null
	readonly expectedContents?: string | null
}

export const FileTransactionOperationSchema = z.strictObject({
	targetPath: z.string().min(1),
	contents: z.string().nullable(),
	expectedContents: z.string().nullable().optional(),
}) satisfies z.ZodType<FileTransactionOperation>

export type FileTransactionErrorCode = 'stale' | 'mutation' | 'rollback'

export class FileTransactionError extends Error {
	readonly code: FileTransactionErrorCode
	readonly targetPath?: string

	constructor(
		code: FileTransactionErrorCode,
		message: string,
		options: { readonly cause?: unknown; readonly targetPath?: string } = {},
	) {
		super(message, { cause: options.cause })
		this.name = 'FileTransactionError'
		this.code = code
		this.targetPath = options.targetPath
	}
}

interface PreparedOperation extends FileTransactionOperation {
	readonly backupPath?: string
	readonly originalContents: string | null
	readonly temporaryPath?: string
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function readOptionalFile(targetPath: string): Promise<string | null> {
	try {
		return await readFile(targetPath, 'utf8')
	} catch (error) {
		if (isMissingFile(error)) {
			return null
		}

		throw error
	}
}

async function removeOptionalFile(targetPath: string): Promise<void> {
	try {
		await unlink(targetPath)
	} catch (error) {
		if (!isMissingFile(error)) {
			throw error
		}
	}
}

async function cleanupArtifacts(
	operations: readonly PreparedOperation[],
	options: { readonly preserveBackups?: boolean } = {},
): Promise<void> {
	await Promise.allSettled(
		operations.flatMap((operation) =>
			[operation.temporaryPath, options.preserveBackups ? undefined : operation.backupPath]
				.filter((candidate): candidate is string => candidate !== undefined)
				.map(removeOptionalFile),
		),
	)
}

/**
 * Applies a deterministic set of optimistic file mutations. All replacements
 * are staged before commit, and completed mutations are rolled back from hard
 * links if a later operation fails.
 */
export async function applyFileTransaction(
	operations: readonly FileTransactionOperation[],
): Promise<void> {
	const validatedOperations = parseCoreInput(
		z.array(FileTransactionOperationSchema),
		operations,
		'file transaction',
	)
	const orderedOperations = [...validatedOperations].sort((left, right) =>
		left.targetPath.localeCompare(right.targetPath),
	)
	const duplicatePath = orderedOperations.find(
		(operation, index) =>
			index > 0 && operation.targetPath === orderedOperations[index - 1]?.targetPath,
	)

	if (duplicatePath) {
		throw new FileTransactionError(
			'mutation',
			`File transaction contains duplicate target ${duplicatePath.targetPath}`,
			{ targetPath: duplicatePath.targetPath },
		)
	}

	const prepared: PreparedOperation[] = []

	// Preparation captures optimistic-read state and creates every temporary
	// file and backup before any canonical target is changed.
	try {
		for (const operation of orderedOperations) {
			const originalContents = await readOptionalFile(operation.targetPath)

			if (
				operation.expectedContents !== undefined &&
				operation.expectedContents !== originalContents
			) {
				throw new FileTransactionError(
					'stale',
					`File changed before mutation: ${operation.targetPath}`,
					{ targetPath: operation.targetPath },
				)
			}

			const token = `${process.pid}.${randomUUID()}`
			const temporaryPath =
				operation.contents === null
					? undefined
					: path.join(
							path.dirname(operation.targetPath),
							`.${path.basename(operation.targetPath)}.${token}.tmp`,
						)
			const backupPath =
				originalContents === null
					? undefined
					: path.join(
							path.dirname(operation.targetPath),
							`.${path.basename(operation.targetPath)}.${token}.bak`,
						)

			const preparedOperation: PreparedOperation = {
				...operation,
				originalContents,
				...(temporaryPath ? { temporaryPath } : {}),
				...(backupPath ? { backupPath } : {}),
			}

			try {
				if (temporaryPath) {
					await writeFile(temporaryPath, operation.contents ?? '', {
						encoding: 'utf8',
						flag: 'wx',
					})
				}

				if (backupPath) {
					await link(operation.targetPath, backupPath)
				}
			} catch (error) {
				await cleanupArtifacts([preparedOperation])
				throw error
			}

			prepared.push(preparedOperation)
		}
	} catch (error) {
		await cleanupArtifacts(prepared)
		throw error
	}

	const mutated: PreparedOperation[] = []

	// Commit in path order. The reverse rollback below restores the exact
	// original contents for every operation that completed before a failure.
	try {
		for (const operation of prepared) {
			if (operation.contents === null) {
				await unlink(operation.targetPath)
				mutated.push(operation)
			} else if (operation.originalContents === null) {
				if (!operation.temporaryPath) {
					throw new Error(`Missing staged file for ${operation.targetPath}`)
				}

				await link(operation.temporaryPath, operation.targetPath)
				mutated.push(operation)
				await unlink(operation.temporaryPath)
			} else {
				if (!operation.temporaryPath) {
					throw new Error(`Missing staged file for ${operation.targetPath}`)
				}

				await rename(operation.temporaryPath, operation.targetPath)
				mutated.push(operation)
			}
		}
	} catch (error) {
		let rollbackFailure: unknown

		try {
			for (const operation of [...mutated].reverse()) {
				if (operation.originalContents === null) {
					await removeOptionalFile(operation.targetPath)
				} else if (operation.backupPath) {
					await rename(operation.backupPath, operation.targetPath)
				}
			}
		} catch (rollbackError) {
			rollbackFailure = rollbackError
		} finally {
			await cleanupArtifacts(prepared, { preserveBackups: rollbackFailure !== undefined })
		}

		if (rollbackFailure !== undefined) {
			throw new FileTransactionError(
				'rollback',
				'Filesystem mutation failed and rollback could not fully restore the repository',
				{ cause: rollbackFailure },
			)
		}

		throw new FileTransactionError('mutation', 'Filesystem mutation failed', { cause: error })
	}

	await cleanupArtifacts(prepared)
}
