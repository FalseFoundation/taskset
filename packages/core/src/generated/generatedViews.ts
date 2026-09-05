import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { TaskMetadata } from '@taskset/contracts'
import * as z from 'zod'
import type { Repository } from '../config/config.ts'
import { serializeTaskFile } from '../tasks/taskFile.ts'
import { listTasks, type TaskRecord } from '../tasks/taskRepository.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

export const GenerateViewsOptionsSchema = z.strictObject({})
export type GenerateViewsOptions = z.infer<typeof GenerateViewsOptionsSchema>

export interface GeneratedViewsResult {
	readonly directory: string
	readonly fingerprint: string
	readonly files: readonly string[]
}

interface GeneratedManifest {
	readonly fingerprint: string
	readonly files: readonly string[]
}

interface MetadataView {
	readonly category: Extract<keyof TaskMetadata, string>
	readonly values: (metadata: TaskMetadata) => readonly string[]
}

const GENERATED_PATH_SEPARATOR = '∕'
const UNSAFE_GENERATED_FILENAME_CHARACTERS = new Set(['"', '*', ':', '<', '>', '?', '\\', '|'])
const TASK_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})/

const TASK_METADATA_VIEWS: readonly MetadataView[] = Object.freeze([
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

function valueList(value: string | number | undefined): readonly string[] {
	return value === undefined ? [] : [String(value)]
}

function fingerprintRecords(records: readonly TaskRecord[]): string {
	const hash = createHash('sha256')

	for (const record of records) {
		hash.update(record.relativePath)
		hash.update('\0')
		hash.update(serializeTaskFile(record.task, { filePath: record.relativePath }))
		hash.update('\0')
	}

	return hash.digest('hex')
}

function dateOnly(value: string): string {
	return TASK_DATE_PATTERN.exec(value)?.[1] ?? value
}

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

function taskLink(record: TaskRecord): string {
	const { metadata } = record.task
	const orderPrefix = metadata.order !== undefined ? `[${metadata.order}] ` : ''
	return `- ${orderPrefix}[${metadata.id}: ${metadata.title}](../../tasks/${metadata.id}.md)`
}

function compareViewRecords(left: TaskRecord, right: TaskRecord): number {
	const leftOrder = left.task.metadata.order
	const rightOrder = right.task.metadata.order

	if (leftOrder !== rightOrder) {
		if (leftOrder === undefined) {
			return 1
		}

		if (rightOrder === undefined) {
			return -1
		}

		return leftOrder - rightOrder
	}

	return left.task.metadata.id.localeCompare(right.task.metadata.id)
}

function addGroup(groups: Map<string, TaskRecord[]>, value: string, record: TaskRecord): void {
	const group = groups.get(value) ?? []
	group.push(record)
	groups.set(value, group)
}

function renderGroups(
	category: string,
	groups: ReadonlyMap<string, readonly TaskRecord[]>,
): ReadonlyMap<string, string> {
	const files = new Map<string, string>()

	for (const [value, records] of [...groups.entries()].sort(([left], [right]) =>
		left.localeCompare(right),
	)) {
		const lines = [...records].sort(compareViewRecords).map(taskLink)
		files.set(
			`${category}/${generatedFileName(value)}`,
			`# ${category[0]?.toUpperCase()}${category.slice(1)}: ${value}\n\n${lines.join('\n')}\n`,
		)
	}

	return files
}

function buildViewFiles(records: readonly TaskRecord[]): ReadonlyMap<string, string> {
	const groupsByCategory = new Map<string, Map<string, TaskRecord[]>>()

	for (const record of records) {
		for (const view of TASK_METADATA_VIEWS) {
			let groups = groupsByCategory.get(view.category)

			if (!groups) {
				groups = new Map()
				groupsByCategory.set(view.category, groups)
			}

			for (const value of view.values(record.task.metadata)) {
				addGroup(groups, value, record)
			}
		}
	}

	const files = new Map<string, string>()

	for (const [category, groups] of [...groupsByCategory.entries()].sort(([left], [right]) =>
		left.localeCompare(right),
	)) {
		for (const [relativePath, contents] of renderGroups(category, groups)) {
			files.set(relativePath, contents)
		}
	}

	return files
}

/**
 * Rebuilds disposable metadata indexes in a staging directory, then swaps the
 * complete tree so readers never observe a partially generated view.
 */
export async function generateViews(
	repository: Repository,
	options: GenerateViewsOptions = {},
): Promise<GeneratedViewsResult> {
	parseCoreInput(GenerateViewsOptionsSchema, options, 'generated view options')
	const records = await listTasks(repository)
	const fingerprint = fingerprintRecords(records)
	const files = buildViewFiles(records)
	const orderedPaths = [...files.keys()].sort()

	const token = `${process.pid}.${randomUUID()}`
	const stagingDirectory = path.join(repository.dataDirectory, `.generated.${token}.tmp`)
	const backupDirectory = path.join(repository.dataDirectory, `.generated.${token}.bak`)
	let movedExisting = false

	await mkdir(stagingDirectory, { recursive: true })

	try {
		for (const relativePath of orderedPaths) {
			const contents = files.get(relativePath)

			if (contents === undefined) {
				continue
			}

			const targetPath = path.join(stagingDirectory, relativePath)
			await mkdir(path.dirname(targetPath), { recursive: true })
			await writeFile(targetPath, contents, 'utf8')
		}

		const manifest: GeneratedManifest = {
			fingerprint,
			files: orderedPaths,
		}
		await writeFile(
			path.join(stagingDirectory, 'manifest.json'),
			`${JSON.stringify(manifest, null, 2)}\n`,
			'utf8',
		)

		try {
			await rename(repository.generatedDirectory, backupDirectory)
			movedExisting = true
		} catch (error) {
			if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
				throw error
			}
		}

		try {
			await rename(stagingDirectory, repository.generatedDirectory)
		} catch (error) {
			if (movedExisting) {
				await rename(backupDirectory, repository.generatedDirectory)
			}
			throw error
		}

		if (movedExisting) {
			await rm(backupDirectory, { recursive: true, force: true })
		}
	} finally {
		await rm(stagingDirectory, { recursive: true, force: true })
	}

	return Object.freeze({
		directory: repository.generatedDirectory,
		fingerprint,
		files: Object.freeze(orderedPaths),
	})
}
