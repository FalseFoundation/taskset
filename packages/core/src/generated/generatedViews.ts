import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DocumentKind, DocumentMetadata, TaskMetadata } from '@taskset/contracts'
import * as z from 'zod'
import {
	DOCUMENT_DIRECTORY_NAMES,
	entityGeneratedDirectory,
	LEGACY_GENERATED_DIRECTORY_NAME,
	type Repository,
} from '../config/config.ts'
import { type DocumentRecord, listDocuments } from '../documents/documentRepository.ts'
import { serializeTaskFile } from '../tasks/taskFile.ts'
import { listTasks, type TaskRecord } from '../tasks/taskRepository.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

export const GenerateViewsOptionsSchema = z.strictObject({})
export type GenerateViewsOptions = z.infer<typeof GenerateViewsOptionsSchema>

export interface GeneratedScopeResult {
	readonly scope: 'tasks' | DocumentKind
	readonly directory: string
	readonly fingerprint: string
	readonly files: readonly string[]
}

export interface GeneratedViewsResult {
	readonly scopes: readonly GeneratedScopeResult[]
	readonly directory: string
	readonly fingerprint: string
	readonly files: readonly string[]
}

interface GeneratedManifest {
	readonly fingerprint: string
	readonly files: readonly string[]
}

interface MetadataView<TMetadata> {
	readonly category: string
	readonly values: (metadata: TMetadata) => readonly string[]
}

const GENERATED_PATH_SEPARATOR = '∕'
const UNSAFE_GENERATED_FILENAME_CHARACTERS = new Set(['"', '*', ':', '<', '>', '?', '\\', '|'])
const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})/

function valueList(value: string | number | undefined): readonly string[] {
	return value === undefined ? [] : [String(value)]
}

function dateOnly(value: string): string {
	return DATE_PATTERN.exec(value)?.[1] ?? value
}

function sharedMetadataViews<
	TMetadata extends {
		readonly title: string
		readonly status: string
		readonly priority?: string
		readonly order?: number
		readonly owner?: string
		readonly assignees?: readonly string[]
		readonly reviewers?: readonly string[]
		readonly team?: string
		readonly estimate?: number
		readonly effort?: number
		readonly risk?: string
		readonly dueDate?: string
		readonly createdAt: string
		readonly updatedAt: string
		readonly labels?: readonly string[]
		readonly dependsOn?: readonly string[]
		readonly related?: readonly string[]
		readonly duplicates?: readonly string[]
		readonly parent?: string
		readonly files?: readonly string[]
		readonly directories?: readonly string[]
		readonly projects?: readonly string[]
	},
>(): readonly MetadataView<TMetadata>[] {
	return Object.freeze([
		{ category: 'title', values: (metadata) => [metadata.title] },
		{ category: 'status', values: (metadata) => [metadata.status] },
		{ category: 'priority', values: (metadata) => valueList(metadata.priority) },
		{ category: 'order', values: (metadata) => valueList(metadata.order) },
		{ category: 'owner', values: (metadata) => valueList(metadata.owner) },
		{ category: 'assignees', values: (metadata) => metadata.assignees ?? [] },
		{ category: 'reviewers', values: (metadata) => metadata.reviewers ?? [] },
		{ category: 'team', values: (metadata) => valueList(metadata.team) },
		{ category: 'estimate', values: (metadata) => valueList(metadata.estimate) },
		{ category: 'effort', values: (metadata) => valueList(metadata.effort) },
		{ category: 'risk', values: (metadata) => valueList(metadata.risk) },
		{ category: 'dueDate', values: (metadata) => valueList(metadata.dueDate).map(dateOnly) },
		{ category: 'createdAt', values: (metadata) => [dateOnly(metadata.createdAt)] },
		{ category: 'updatedAt', values: (metadata) => [dateOnly(metadata.updatedAt)] },
		{ category: 'labels', values: (metadata) => metadata.labels ?? [] },
		{ category: 'dependsOn', values: (metadata) => metadata.dependsOn ?? [] },
		{ category: 'related', values: (metadata) => metadata.related ?? [] },
		{ category: 'duplicates', values: (metadata) => metadata.duplicates ?? [] },
		{ category: 'parent', values: (metadata) => valueList(metadata.parent) },
		{ category: 'files', values: (metadata) => metadata.files ?? [] },
		{ category: 'directories', values: (metadata) => metadata.directories ?? [] },
		{ category: 'projects', values: (metadata) => metadata.projects ?? [] },
	])
}

const TASK_METADATA_VIEWS = sharedMetadataViews<TaskMetadata>()
const DOCUMENT_METADATA_VIEWS: readonly MetadataView<DocumentMetadata>[] = Object.freeze([
	{ category: 'type', values: (metadata) => [metadata.type] },
	...sharedMetadataViews<DocumentMetadata>(),
])

function generatedFileName(value: string): string {
	const readableName = Array.from(
		value.replaceAll('/', GENERATED_PATH_SEPARATOR).replaceAll('\\', GENERATED_PATH_SEPARATOR),
	)
		.map((character) =>
			character < ' ' || UNSAFE_GENERATED_FILENAME_CHARACTERS.has(character) ? '-' : character,
		)
		.join('')
		.trim()

	return `${readableName || 'empty'}.md`
}

function entityLink(id: string, title: string, order: number | undefined): string {
	const orderPrefix = order !== undefined ? `[${order}] ` : ''
	return `- ${orderPrefix}[${id}: ${title}](../${id}.md)`
}

function compareByOrderThenId(
	leftOrder: number | undefined,
	leftId: string,
	rightOrder: number | undefined,
	rightId: string,
): number {
	if (leftOrder !== rightOrder) {
		if (leftOrder === undefined) {
			return 1
		}

		if (rightOrder === undefined) {
			return -1
		}

		return leftOrder - rightOrder
	}

	return leftId.localeCompare(rightId)
}

async function swapGeneratedDirectory(
	targetDirectory: string,
	stagingDirectory: string,
	backupDirectory: string,
): Promise<void> {
	let movedExisting = false

	try {
		await rename(targetDirectory, backupDirectory)
		movedExisting = true
	} catch (error) {
		if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
			throw error
		}
	}

	try {
		await rename(stagingDirectory, targetDirectory)
	} catch (error) {
		if (movedExisting) {
			await rename(backupDirectory, targetDirectory)
		}
		throw error
	}

	if (movedExisting) {
		await rm(backupDirectory, { recursive: true, force: true })
	}
}

async function writeGeneratedScope(options: {
	readonly entityDirectory: string
	readonly fingerprint: string
	readonly files: ReadonlyMap<string, string>
}): Promise<{ readonly directory: string; readonly files: readonly string[] }> {
	const orderedPaths = [...options.files.keys()].sort()
	const targetDirectory = entityGeneratedDirectory(options.entityDirectory)
	const token = `${process.pid}.${randomUUID()}`
	const stagingDirectory = path.join(options.entityDirectory, `.generated.${token}.tmp`)
	const backupDirectory = path.join(options.entityDirectory, `.generated.${token}.bak`)

	await mkdir(stagingDirectory, { recursive: true })

	try {
		for (const relativePath of orderedPaths) {
			const contents = options.files.get(relativePath)

			if (contents === undefined) {
				continue
			}

			const targetPath = path.join(stagingDirectory, relativePath)
			await mkdir(path.dirname(targetPath), { recursive: true })
			await writeFile(targetPath, contents, 'utf8')
		}

		const manifest: GeneratedManifest = {
			fingerprint: options.fingerprint,
			files: orderedPaths,
		}
		await writeFile(
			path.join(stagingDirectory, 'manifest.json'),
			`${JSON.stringify(manifest, null, 2)}\n`,
			'utf8',
		)
		await swapGeneratedDirectory(targetDirectory, stagingDirectory, backupDirectory)
	} finally {
		await rm(stagingDirectory, { recursive: true, force: true })
	}

	return Object.freeze({
		directory: targetDirectory,
		files: Object.freeze(orderedPaths),
	})
}

function buildGroupedFiles<TRecord, TMetadata>(
	records: readonly TRecord[],
	views: readonly MetadataView<TMetadata>[],
	metadataOf: (record: TRecord) => TMetadata & {
		readonly id: string
		readonly title: string
		readonly order?: number
	},
): ReadonlyMap<string, string> {
	const groupsByCategory = new Map<string, Map<string, TRecord[]>>()

	for (const record of records) {
		const metadata = metadataOf(record)

		for (const view of views) {
			let groups = groupsByCategory.get(view.category)

			if (!groups) {
				groups = new Map()
				groupsByCategory.set(view.category, groups)
			}

			for (const value of view.values(metadata)) {
				const group = groups.get(value) ?? []
				group.push(record)
				groups.set(value, group)
			}
		}
	}

	const files = new Map<string, string>()

	for (const [category, groups] of [...groupsByCategory.entries()].sort(([left], [right]) =>
		left.localeCompare(right),
	)) {
		for (const [value, groupedRecords] of [...groups.entries()].sort(([left], [right]) =>
			left.localeCompare(right),
		)) {
			const lines = [...groupedRecords]
				.sort((left, right) => {
					const leftMetadata = metadataOf(left)
					const rightMetadata = metadataOf(right)
					return compareByOrderThenId(
						leftMetadata.order,
						leftMetadata.id,
						rightMetadata.order,
						rightMetadata.id,
					)
				})
				.map((record) => {
					const metadata = metadataOf(record)
					return entityLink(metadata.id, metadata.title, metadata.order)
				})
			files.set(
				`${category}/${generatedFileName(value)}`,
				`# ${category[0]?.toUpperCase()}${category.slice(1)}: ${value}\n\n${lines.join('\n')}\n`,
			)
		}
	}

	return files
}

function fingerprintTaskRecords(records: readonly TaskRecord[]): string {
	const hash = createHash('sha256')

	for (const record of records) {
		hash.update(record.relativePath)
		hash.update('\0')
		hash.update(serializeTaskFile(record.task, { filePath: record.relativePath }))
		hash.update('\0')
	}

	return hash.digest('hex')
}

function fingerprintDocumentRecords(records: readonly DocumentRecord[]): string {
	const hash = createHash('sha256')

	for (const record of records) {
		hash.update(record.relativePath)
		hash.update('\0')
		hash.update(JSON.stringify(record.document.metadata))
		hash.update('\0')
		hash.update(record.document.body)
		hash.update('\0')
	}

	return hash.digest('hex')
}

/**
 * Rebuilds disposable metadata indexes beside each entity folder, then swaps
 * each complete tree so readers never observe a partially generated view.
 */
export async function generateViews(
	repository: Repository,
	options: GenerateViewsOptions = {},
): Promise<GeneratedViewsResult> {
	parseCoreInput(GenerateViewsOptionsSchema, options, 'generated view options')
	await rm(path.join(repository.dataDirectory, LEGACY_GENERATED_DIRECTORY_NAME), {
		recursive: true,
		force: true,
	})

	const taskRecords = await listTasks(repository)
	const taskFingerprint = fingerprintTaskRecords(taskRecords)
	const taskFiles = buildGroupedFiles(
		taskRecords,
		TASK_METADATA_VIEWS,
		(record) => record.task.metadata,
	)
	const taskScope = await writeGeneratedScope({
		entityDirectory: repository.tasksDirectory,
		fingerprint: taskFingerprint,
		files: taskFiles,
	})

	const scopes: GeneratedScopeResult[] = [
		Object.freeze({
			scope: 'tasks',
			directory: taskScope.directory,
			fingerprint: taskFingerprint,
			files: taskScope.files,
		}),
	]

	for (const kind of Object.keys(DOCUMENT_DIRECTORY_NAMES) as DocumentKind[]) {
		const documentRecords = await listDocuments(repository, kind)
		const fingerprint = fingerprintDocumentRecords(documentRecords)
		const files = buildGroupedFiles(
			documentRecords,
			DOCUMENT_METADATA_VIEWS,
			(record) => record.document.metadata,
		)
		const written = await writeGeneratedScope({
			entityDirectory: path.join(repository.documentsDirectory, DOCUMENT_DIRECTORY_NAMES[kind]),
			fingerprint,
			files,
		})
		scopes.push(
			Object.freeze({
				scope: kind,
				directory: written.directory,
				fingerprint,
				files: written.files,
			}),
		)
	}

	const aggregateFiles = scopes.flatMap((scope) =>
		scope.files.map((file) => `${scope.scope}/${file}`),
	)
	const aggregateFingerprint = createHash('sha256')
		.update(scopes.map((scope) => `${scope.scope}:${scope.fingerprint}`).join('\n'))
		.digest('hex')

	return Object.freeze({
		scopes: Object.freeze(scopes),
		directory: taskScope.directory,
		fingerprint: aggregateFingerprint,
		files: Object.freeze(aggregateFiles),
	})
}
