import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as z from 'zod'
import type { Repository } from '../config/config.ts'
import { serializeTaskFile } from '../tasks/taskFile.ts'
import { listTasks, type TaskRecord } from '../tasks/taskRepository.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

const GENERATED_MANIFEST_VERSION = 1

export const GenerateViewsOptionsSchema = z.strictObject({})
export type GenerateViewsOptions = z.infer<typeof GenerateViewsOptionsSchema>

export interface GeneratedViewsResult {
	readonly directory: string
	readonly fingerprint: string
	readonly files: readonly string[]
}

interface GeneratedManifest {
	readonly schemaVersion: 1
	readonly fingerprint: string
	readonly files: readonly string[]
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

function encodedFileName(value: string): string {
	return `${encodeURIComponent(value)}.md`
}

function taskLink(record: TaskRecord): string {
	const { metadata } = record.task
	return `- [${metadata.id}: ${metadata.title}](../../tasks/${metadata.id}.md)`
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
		const lines = [...records]
			.sort((left, right) => left.task.metadata.id.localeCompare(right.task.metadata.id))
			.map(taskLink)
		files.set(
			`${category}/${encodedFileName(value)}`,
			`# ${category[0]?.toUpperCase()}${category.slice(1)}: ${value}\n\n${lines.join('\n')}\n`,
		)
	}

	return files
}

function buildViewFiles(records: readonly TaskRecord[]): ReadonlyMap<string, string> {
	const status = new Map<string, TaskRecord[]>()
	const priority = new Map<string, TaskRecord[]>()
	const project = new Map<string, TaskRecord[]>()
	const assignee = new Map<string, TaskRecord[]>()

	for (const record of records) {
		const { metadata } = record.task
		addGroup(status, metadata.status, record)

		if (metadata.priority) {
			addGroup(priority, metadata.priority, record)
		}

		for (const value of metadata.projects ?? []) {
			addGroup(project, value, record)
		}

		for (const value of metadata.assignees ?? []) {
			addGroup(assignee, value, record)
		}
	}

	return new Map([
		...renderGroups('status', status),
		...renderGroups('priority', priority),
		...renderGroups('project', project),
		...renderGroups('assignee', assignee),
	])
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
			schemaVersion: GENERATED_MANIFEST_VERSION,
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
