import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { formatDate } from '@taskset/utils'
import * as z from 'zod'
import type { Repository } from '../config/config.ts'
import { applyFileTransaction } from '../repository/fileTransaction.ts'
import { listTasks } from '../tasks/taskRepository.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

const SNAPSHOT_MANIFEST_VERSION = 1
const SnapshotIdSchema = z
	.string()
	.regex(
		/^\d{8}T\d{6}Z-[a-f0-9]{12}$/u,
		'Expected a snapshot ID in the form YYYYMMDDTHHMMSSZ-<hash>',
	)

export const CreateSnapshotOptionsSchema = z.strictObject({
	now: z.custom<() => Date>((value) => typeof value === 'function').optional(),
})
export type CreateSnapshotOptions = z.infer<typeof CreateSnapshotOptionsSchema>

export const RestoreSnapshotOptionsSchema = z.strictObject({
	apply: z.boolean().optional(),
	onWarning: z
		.custom<(warning: { readonly code: string; readonly message: string }) => void>(
			(value) => typeof value === 'function',
		)
		.optional(),
})
export type RestoreSnapshotOptions = z.infer<typeof RestoreSnapshotOptionsSchema>

export interface SnapshotFile {
	readonly path: string
	readonly sha256: string
}

export interface SnapshotManifest {
	readonly schemaVersion: 1
	readonly id: string
	readonly createdAt: string
	readonly files: readonly SnapshotFile[]
}

export interface SnapshotChange {
	readonly action: 'create' | 'update' | 'delete'
	readonly path: string
}

export interface RestoreSnapshotResult {
	readonly snapshot: SnapshotManifest
	readonly applied: boolean
	readonly changes: readonly SnapshotChange[]
}

function digest(value: string): string {
	return createHash('sha256').update(value).digest('hex')
}

function snapshotTimestamp(date: Date): string {
	return date
		.toISOString()
		.replace(/[-:]/gu, '')
		.replace(/\.\d{3}Z$/u, 'Z')
}

function snapshotArchivePath(repository: Repository, canonicalPath: string): string {
	const absolutePath = path.join(repository.rootDirectory, canonicalPath)
	const relativePath = path.relative(repository.dataDirectory, absolutePath)

	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		throw new TypeError(`Snapshot path is outside .taskset: ${canonicalPath}`)
	}

	return relativePath
}

function parseManifest(source: string, directoryName?: string): SnapshotManifest {
	const value = JSON.parse(source) as Partial<SnapshotManifest>

	if (
		value.schemaVersion !== SNAPSHOT_MANIFEST_VERSION ||
		typeof value.id !== 'string' ||
		!SnapshotIdSchema.safeParse(value.id).success ||
		typeof value.createdAt !== 'string' ||
		!Array.isArray(value.files)
	) {
		throw new TypeError('Invalid Taskset snapshot manifest')
	}

	if (directoryName !== undefined && value.id !== directoryName) {
		throw new TypeError(`Snapshot manifest ID does not match directory ${directoryName}`)
	}

	const files = value.files.map((file) => {
		if (
			typeof file !== 'object' ||
			file === null ||
			typeof file.path !== 'string' ||
			typeof file.sha256 !== 'string'
		) {
			throw new TypeError('Invalid Taskset snapshot file entry')
		}

		return Object.freeze({ path: file.path, sha256: file.sha256 })
	})

	return Object.freeze({
		schemaVersion: 1,
		id: value.id,
		createdAt: value.createdAt,
		files: Object.freeze(files),
	})
}

/**
 * Captures the current canonical task sources in an immutable, content-addressed
 * snapshot directory.
 */
export async function createSnapshot(
	repository: Repository,
	options: CreateSnapshotOptions = {},
): Promise<SnapshotManifest> {
	const validatedOptions = parseCoreInput(
		CreateSnapshotOptionsSchema,
		options,
		'snapshot creation options',
	)
	const now = validatedOptions.now?.() ?? new Date()
	const records = await listTasks(repository)
	const sources = await Promise.all(
		records.map(async (record) => ({
			path: record.relativePath,
			source: await readFile(path.join(repository.rootDirectory, record.relativePath), 'utf8'),
		})),
	)
	const contentHash = createHash('sha256')

	for (const file of sources) {
		contentHash.update(file.path)
		contentHash.update('\0')
		contentHash.update(file.source)
		contentHash.update('\0')
	}

	const id = `${snapshotTimestamp(now)}-${contentHash.digest('hex').slice(0, 12)}`
	const manifest: SnapshotManifest = Object.freeze({
		schemaVersion: 1,
		id,
		createdAt: formatDate(now),
		files: Object.freeze(
			sources.map((file) => Object.freeze({ path: file.path, sha256: digest(file.source) })),
		),
	})
	const token = `${process.pid}.${randomUUID()}`
	const stagingDirectory = path.join(repository.snapshotsDirectory, `.${id}.${token}.tmp`)
	const targetDirectory = path.join(repository.snapshotsDirectory, id)

	await mkdir(stagingDirectory, { recursive: true })

	try {
		for (const file of sources) {
			const targetPath = path.join(stagingDirectory, snapshotArchivePath(repository, file.path))
			await mkdir(path.dirname(targetPath), { recursive: true })
			await writeFile(targetPath, file.source, 'utf8')
		}

		await writeFile(
			path.join(stagingDirectory, 'manifest.json'),
			`${JSON.stringify(manifest, null, 2)}\n`,
			'utf8',
		)
		await mkdir(repository.snapshotsDirectory, { recursive: true })
		await rename(stagingDirectory, targetDirectory)
	} finally {
		await rm(stagingDirectory, { recursive: true, force: true })
	}

	return manifest
}

/** Lists valid snapshot manifests newest first. */
export async function listSnapshots(repository: Repository): Promise<readonly SnapshotManifest[]> {
	let entries: string[]

	try {
		entries = await readdir(repository.snapshotsDirectory)
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			return Object.freeze([])
		}
		throw error
	}

	const manifests: SnapshotManifest[] = []

	for (const entry of entries.filter((value) => SnapshotIdSchema.safeParse(value).success).sort()) {
		const source = await readFile(
			path.join(repository.snapshotsDirectory, entry, 'manifest.json'),
			'utf8',
		)
		manifests.push(parseManifest(source, entry))
	}

	return Object.freeze(manifests.reverse())
}

async function readSnapshotSources(
	repository: Repository,
	snapshotId: string,
): Promise<{
	readonly manifest: SnapshotManifest
	readonly sources: ReadonlyMap<string, string>
}> {
	const validatedId = parseCoreInput(SnapshotIdSchema, snapshotId, 'snapshot ID')
	const directory = path.join(repository.snapshotsDirectory, validatedId)
	const manifest = parseManifest(
		await readFile(path.join(directory, 'manifest.json'), 'utf8'),
		validatedId,
	)
	const sources = new Map<string, string>()

	for (const file of manifest.files) {
		const source = await readFile(
			path.join(directory, snapshotArchivePath(repository, file.path)),
			'utf8',
		)

		if (digest(source) !== file.sha256) {
			throw new TypeError(`Snapshot file checksum mismatch: ${file.path}`)
		}

		sources.set(file.path, source)
	}

	return { manifest, sources }
}

/**
 * Compares a snapshot with current canonical tasks and only applies the
 * resulting multi-file transaction when `apply` is explicitly true.
 */
export async function restoreSnapshot(
	repository: Repository,
	snapshotId: string,
	options: RestoreSnapshotOptions = {},
): Promise<RestoreSnapshotResult> {
	const validatedOptions = parseCoreInput(
		RestoreSnapshotOptionsSchema,
		options,
		'snapshot restore options',
	)
	const { manifest, sources } = await readSnapshotSources(repository, snapshotId)
	const currentRecords = await listTasks(repository)
	const currentSources = new Map(
		await Promise.all(
			currentRecords.map(
				async (record) =>
					[
						record.relativePath,
						await readFile(path.join(repository.rootDirectory, record.relativePath), 'utf8'),
					] as const,
			),
		),
	)
	const allPaths = new Set([...currentSources.keys(), ...sources.keys()])
	const changes: SnapshotChange[] = []

	for (const relativePath of [...allPaths].sort()) {
		const current = currentSources.get(relativePath)
		const restored = sources.get(relativePath)

		if (current === restored) {
			continue
		}

		changes.push({
			action: current === undefined ? 'create' : restored === undefined ? 'delete' : 'update',
			path: relativePath,
		})
	}

	if (validatedOptions.apply && changes.length > 0) {
		await applyFileTransaction(
			changes.map((change) => ({
				targetPath: path.join(repository.rootDirectory, change.path),
				contents: sources.get(change.path) ?? null,
				expectedContents: currentSources.get(change.path) ?? null,
			})),
		)

		try {
			const { generateViews } = await import('../generated/generatedViews.ts')
			await generateViews(repository)
		} catch (error) {
			validatedOptions.onWarning?.({
				code: 'generated-view-refresh',
				message: `Snapshot restore succeeded, but generated views could not be refreshed: ${
					error instanceof Error ? error.message : 'unknown generation failure'
				}`,
			})
		}
	}

	return Object.freeze({
		snapshot: manifest,
		applied: validatedOptions.apply === true,
		changes: Object.freeze(changes),
	})
}
