import type { Dirent } from 'node:fs'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DocumentKind, DocumentMetadata, TaskMetadata } from '@taskset/contracts'
import { parseFrontmatter, serializeFrontmatter } from '@taskset/utils'
import { DOCUMENT_DIRECTORY_NAMES, type Repository, RepositorySchema } from '../config/config.ts'
import { diagnoseRepository, type RepositoryDiagnostic } from '../diagnostics/doctor.ts'
import {
	type DocumentIdMigration,
	listDocuments,
	migrateDocumentIds,
	parseDocumentFile,
	serializeDocumentFile,
} from '../documents/documentRepository.ts'
import { missingDocumentHeadings } from '../documents/documentTemplate.ts'
import { type GeneratedViewsResult, generateViews } from '../generated/generatedViews.ts'
import {
	EntityReferenceError,
	EntityReferenceIndex,
	type EntityReferenceTarget,
} from '../ids/entityReference.ts'
import { applyFileTransaction } from '../repository/fileTransaction.ts'
import { DEFAULT_DATA_IGNORE_SOURCE } from '../repository/repository.ts'
import { parseTaskFile, serializeTaskFile } from '../tasks/taskFile.ts'
import { listTasks, migrateTaskIds, type TaskIdMigration } from '../tasks/taskRepository.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

export class RepositorySyncError extends Error {
	readonly diagnostics: readonly RepositoryDiagnostic[]

	constructor(diagnostics: readonly RepositoryDiagnostic[]) {
		super(
			`Repository sync preflight failed with ${diagnostics.length} diagnostic(s): ${diagnostics
				.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
				.join('; ')}`,
		)
		this.name = 'RepositorySyncError'
		this.diagnostics = Object.freeze([...diagnostics])
	}
}

export type RepositorySyncChangeAction =
	| 'infer-type'
	| 'quote-reference'
	| 'insert-heading'
	| 'rewrite-relationship'
	| 'rewrite-prose-link'
	| 'rename'
	| 'create'
	| 'update'
	| 'delete'
	| 'rebuild-generated-views'

export interface RepositorySyncChange {
	readonly action: RepositorySyncChangeAction
	readonly path: string
	readonly detail?: string
}

export interface RepositorySyncProgress {
	readonly completed: number
	readonly total: number
	readonly percent: number
	readonly phase: 'preflight' | 'plan' | 'stage' | 'publish' | 'generated'
}

export interface RepositorySyncOptions {
	readonly concurrency?: number
	readonly dryRun?: boolean
	readonly fix?: boolean
	readonly beforePublish?: () => void | Promise<void>
	readonly onProgress?: (progress: RepositorySyncProgress) => void
}

export interface RepositorySyncResult {
	readonly applied: boolean
	readonly migrations: readonly TaskIdMigration[]
	readonly documentMigrations: readonly DocumentIdMigration[]
	readonly changes: readonly RepositorySyncChange[]
	readonly generated?: GeneratedViewsResult
}

const LEGACY_DATA_IGNORE_SOURCE = `cache/
generated/
generated.*/
snapshots/
`
const RELATIONSHIP_ARRAY_FIELDS = ['dependsOn', 'related', 'duplicates'] as const
const REPAIRABLE_CODES = new Set([
	'invalid-reference-type',
	'missing-document-type',
	'missing-template-heading',
	'missing-reference',
	'missing-dependency',
])

function progress(
	options: RepositorySyncOptions,
	completed: number,
	total: number,
	phase: RepositorySyncProgress['phase'],
): void {
	options.onProgress?.({ completed, total, percent: Math.round((completed / total) * 100), phase })
}

function stagedRepository(repository: Repository, rootDirectory: string): Repository {
	const dataDirectory = path.join(rootDirectory, '.taskset')
	return {
		...repository,
		rootDirectory,
		configPath: path.join(rootDirectory, path.basename(repository.configPath)),
		dataDirectory,
		tasksDirectory: path.join(dataDirectory, 'tasks'),
		documentsDirectory: dataDirectory,
		generatedDirectory: path.join(dataDirectory, 'tasks', '.generated'),
		snapshotsDirectory: path.join(dataDirectory, 'snapshots'),
	}
}

function repositoryPath(repository: Repository, absolutePath: string): string {
	return path.relative(repository.rootDirectory, absolutePath).split(path.sep).join('/')
}

async function ensureDirectories(repository: Repository): Promise<void> {
	await Promise.all([
		mkdir(repository.tasksDirectory, { recursive: true }),
		...Object.values(DOCUMENT_DIRECTORY_NAMES).map((name) =>
			mkdir(path.join(repository.documentsDirectory, name), { recursive: true }),
		),
	])
}

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
		if (existing !== DEFAULT_DATA_IGNORE_SOURCE)
			await writeFile(ignorePath, DEFAULT_DATA_IGNORE_SOURCE, 'utf8')
		return
	}
	const lines = new Set(
		existing
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean),
	)
	for (const obsolete of ['generated/', 'generated.*/']) lines.delete(obsolete)
	for (const required of ['cache/', 'snapshots/', '**/.generated/', '**/.generated.*/'])
		lines.add(required)
	const ordered = [
		'cache/',
		'snapshots/',
		'**/.generated/',
		'**/.generated.*/',
		...[...lines].filter(
			(line) => !['cache/', 'snapshots/', '**/.generated/', '**/.generated.*/'].includes(line),
		),
	]
	const next = `${ordered.join('\n')}\n`
	if (next !== existing) await writeFile(ignorePath, next, 'utf8')
}

async function repairStagedFiles(
	repository: Repository,
	changes: RepositorySyncChange[],
): Promise<void> {
	const directories: [DocumentKind | undefined, string][] = [
		[undefined, repository.tasksDirectory],
		...(Object.entries(DOCUMENT_DIRECTORY_NAMES) as [DocumentKind, string][]).map(
			([kind, name]): [DocumentKind, string] => [kind, path.join(repository.dataDirectory, name)],
		),
	]
	for (const [kind, directory] of directories) {
		let entries: Dirent<string>[] = []
		try {
			entries = await readdir(directory, { withFileTypes: true })
		} catch {
			continue
		}
		for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith('.md'))) {
			const absolutePath = path.join(directory, entry.name)
			const relativePath = repositoryPath(repository, absolutePath)
			const source = await readFile(absolutePath, 'utf8')
			const parsed = parseFrontmatter(source)
			const metadata = { ...(parsed.attributes as Record<string, unknown>) }
			let body = parsed.body
			let repairedFile = false
			const lines = source.split('\n')
			const closingDelimiter = lines.findIndex((line, index) => index > 0 && line === '---')
			let activeRelationship: (typeof RELATIONSHIP_ARRAY_FIELDS)[number] | undefined
			const relationshipIndexes = new Map<string, number>()
			for (let index = 1; index < closingDelimiter; index += 1) {
				const line = lines[index] ?? ''
				const field = RELATIONSHIP_ARRAY_FIELDS.find((candidate) => line === `${candidate}:`)
				if (field) {
					activeRelationship = field
					relationshipIndexes.set(field, 0)
					continue
				}
				if (/^[A-Za-z]/u.test(line)) activeRelationship = undefined
				const item = /^\s+-\s+(\d+)\s*$/u.exec(line)
				if (activeRelationship && item?.[1]) {
					const itemIndex = relationshipIndexes.get(activeRelationship) ?? 0
					lines[index] = line.replace(item[1], `"${item[1]}"`)
					repairedFile = true
					changes.push({
						action: 'quote-reference',
						path: relativePath,
						detail: `${activeRelationship}[${itemIndex}]`,
					})
					relationshipIndexes.set(activeRelationship, itemIndex + 1)
				}
				const parent = /^parent:\s+(\d+)\s*$/u.exec(line)
				if (parent?.[1]) {
					lines[index] = `parent: "${parent[1]}"`
					repairedFile = true
					changes.push({ action: 'quote-reference', path: relativePath, detail: 'parent' })
				}
			}
			if (kind && metadata.type === undefined) {
				const idLine = lines.findIndex(
					(line, index) => index > 0 && index < closingDelimiter && /^id:/u.test(line),
				)
				lines.splice(idLine >= 0 ? idLine + 1 : 1, 0, `type: ${kind}`)
				metadata.type = kind
				repairedFile = true
				changes.push({ action: 'infer-type', path: relativePath, detail: kind })
			}
			if (kind && metadata.type === kind) {
				for (const heading of missingDocumentHeadings(kind, body)) {
					body = `${body.trimEnd()}\n\n## ${heading}\n`
					repairedFile = true
					changes.push({ action: 'insert-heading', path: relativePath, detail: heading })
				}
			}
			if (!repairedFile) continue
			const repairedClosingDelimiter = lines.findIndex((line, index) => index > 0 && line === '---')
			const next = `${lines.slice(0, repairedClosingDelimiter + 1).join('\n')}\n${body}`
			if (next !== source) await writeFile(absolutePath, next, 'utf8')
		}
	}
}

function targetForTask(
	record: Awaited<ReturnType<typeof listTasks>>[number],
): EntityReferenceTarget {
	return {
		id: record.task.metadata.id,
		relativePath: record.relativePath,
		title: record.task.metadata.title,
		kind: 'task',
		status: record.task.metadata.status,
	}
}

function targetForDocument(
	record: Awaited<ReturnType<typeof listDocuments>>[number],
): EntityReferenceTarget {
	return {
		id: record.document.metadata.id,
		relativePath: record.relativePath,
		title: record.document.metadata.title,
		kind: record.document.metadata.type,
		status: record.document.metadata.status,
	}
}

async function targets(repository: Repository): Promise<readonly EntityReferenceTarget[]> {
	const [tasks, documents] = await Promise.all([listTasks(repository), listDocuments(repository)])
	return [...tasks.map(targetForTask), ...documents.map(targetForDocument)]
}

function normalizedRelationships<T extends TaskMetadata | DocumentMetadata>(
	metadata: T,
	index: EntityReferenceIndex,
): T {
	const resolve = (value: string): string => index.resolveId(value)
	return {
		...metadata,
		...(metadata.dependsOn ? { dependsOn: metadata.dependsOn.map(resolve) } : {}),
		...(metadata.related ? { related: metadata.related.map(resolve) } : {}),
		...(metadata.duplicates ? { duplicates: metadata.duplicates.map(resolve) } : {}),
		...(metadata.parent ? { parent: resolve(metadata.parent) } : {}),
	}
}

function relationshipPaths(
	metadata: TaskMetadata | DocumentMetadata,
	index: EntityReferenceIndex,
): Pick<TaskMetadata, 'dependsOn' | 'related' | 'duplicates' | 'parent'> {
	const pathFor = (value: string): string => index.pathForId(index.resolveId(value)) ?? value
	return {
		...(metadata.dependsOn ? { dependsOn: metadata.dependsOn.map(pathFor) } : {}),
		...(metadata.related ? { related: metadata.related.map(pathFor) } : {}),
		...(metadata.duplicates ? { duplicates: metadata.duplicates.map(pathFor) } : {}),
		...(metadata.parent ? { parent: pathFor(metadata.parent) } : {}),
	}
}

function relationshipsMatch(
	metadata: TaskMetadata | DocumentMetadata,
	expected: ReturnType<typeof relationshipPaths>,
): boolean {
	return (
		JSON.stringify({
			dependsOn: metadata.dependsOn,
			related: metadata.related,
			duplicates: metadata.duplicates,
			parent: metadata.parent,
		}) ===
		JSON.stringify({
			dependsOn: expected.dependsOn,
			related: expected.related,
			duplicates: expected.duplicates,
			parent: expected.parent,
		})
	)
}

async function canonicalizeRelationships(
	repository: Repository,
	index: EntityReferenceIndex,
	changes: RepositorySyncChange[],
): Promise<void> {
	for (const record of await listTasks(repository)) {
		const absolutePath = path.join(repository.rootDirectory, record.relativePath)
		const source = await readFile(absolutePath, 'utf8')
		const task = parseTaskFile(source, { filePath: record.relativePath })
		const paths = relationshipPaths(task.metadata, index)
		if (relationshipsMatch(task.metadata, paths)) continue
		const next = serializeTaskFile(
			{ ...task, metadata: normalizedRelationships(task.metadata, index) },
			{
				filePath: record.relativePath,
				referencePathForId: (id) => index.pathForId(id),
			},
		)
		if (next !== source) {
			await writeFile(absolutePath, next, 'utf8')
			changes.push({ action: 'rewrite-relationship', path: record.relativePath })
		}
	}
	for (const record of await listDocuments(repository)) {
		const absolutePath = path.join(repository.rootDirectory, record.relativePath)
		const source = await readFile(absolutePath, 'utf8')
		const document = parseDocumentFile(source)
		const paths = relationshipPaths(document.metadata, index)
		if (relationshipsMatch(document.metadata, paths)) continue
		const next = serializeDocumentFile(
			{ ...document, metadata: normalizedRelationships(document.metadata, index) },
			{ referencePathForId: (id) => index.pathForId(id) },
		)
		if (next !== source) {
			await writeFile(absolutePath, next, 'utf8')
			changes.push({ action: 'rewrite-relationship', path: record.relativePath })
		}
	}
}

function regexpEscape(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function proseAliases(target: EntityReferenceTarget): readonly string[] {
	const basename = path.posix.basename(target.relativePath)
	return [target.relativePath, basename, basename.replace(/\.md$/u, ''), ...(target.aliases ?? [])]
		.filter((value, index, values) => value.length > 4 && values.indexOf(value) === index)
		.sort((left, right) => right.length - left.length)
}

function rewriteProse(
	source: string,
	sourcePath: string,
	index: EntityReferenceIndex,
): { readonly contents: string; readonly count: number } {
	let fenced = false
	let count = 0
	const lines = source.split('\n').map((line) => {
		if (/^\s*```/u.test(line)) {
			fenced = !fenced
			return line
		}
		if (fenced || /https?:\/\//u.test(line) || /\[[^\]]+\]\([^)]+\)/u.test(line)) return line
		let next = line
		for (const target of index.targets) {
			for (const alias of proseAliases(target)) {
				const expression = new RegExp(`(?<![\\w/.-])${regexpEscape(alias)}(?![\\w.-])`, 'gu')
				if (!expression.test(next)) continue
				const relativeTarget = path.posix.relative(
					path.posix.dirname(sourcePath),
					target.relativePath,
				)
				next = next.replace(
					expression,
					`[${path.posix.basename(target.relativePath)}](${relativeTarget})`,
				)
				count += 1
			}
		}
		return next
	})
	return { contents: lines.join('\n'), count }
}

async function rewriteManagedProse(
	repository: Repository,
	index: EntityReferenceIndex,
	changes: RepositorySyncChange[],
): Promise<void> {
	for (const target of index.targets) {
		const absolutePath = path.join(repository.rootDirectory, target.relativePath)
		const source = await readFile(absolutePath, 'utf8')
		const parsed = parseFrontmatter(source)
		const rewritten = rewriteProse(parsed.body, target.relativePath, index)
		if (rewritten.contents !== parsed.body) {
			await writeFile(
				absolutePath,
				serializeFrontmatter(parsed.attributes as Record<string, unknown>, rewritten.contents),
				'utf8',
			)
			changes.push({
				action: 'rewrite-prose-link',
				path: target.relativePath,
				detail: `${rewritten.count} link(s)`,
			})
		}
	}
}

async function canonicalFiles(repository: Repository): Promise<Map<string, string>> {
	const files = new Map<string, string>()
	const candidates = [
		path.join(repository.dataDirectory, '.gitignore'),
		repository.tasksDirectory,
		...Object.values(DOCUMENT_DIRECTORY_NAMES).map((name) =>
			path.join(repository.dataDirectory, name),
		),
	]
	for (const candidate of candidates) {
		let entries: Dirent<string>[]
		try {
			entries = await readdir(candidate, { withFileTypes: true })
		} catch {
			try {
				files.set(repositoryPath(repository, candidate), await readFile(candidate, 'utf8'))
			} catch {
				// Missing canonical files are represented by absence.
			}
			continue
		}
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith('.md')) continue
			const absolutePath = path.join(candidate, entry.name)
			files.set(repositoryPath(repository, absolutePath), await readFile(absolutePath, 'utf8'))
		}
	}
	return files
}

function aliasTargets(
	original: readonly EntityReferenceTarget[],
	finalTargets: readonly EntityReferenceTarget[],
	migrations: readonly { readonly from: string; readonly to: string }[],
): readonly EntityReferenceTarget[] {
	const replacement = new Map(migrations.map((migration) => [migration.from, migration.to]))
	return finalTargets.map((target) => {
		const aliases = original
			.filter((candidate) => (replacement.get(candidate.id) ?? candidate.id) === target.id)
			.flatMap((candidate) => [
				...(candidate.id.length > 6 ? [candidate.id] : []),
				candidate.relativePath,
				path.posix.basename(candidate.relativePath),
				path.posix.basename(candidate.relativePath, '.md'),
			])
		return { ...target, aliases }
	})
}

function referenceDiagnostic(error: EntityReferenceError): RepositoryDiagnostic {
	return {
		code: 'missing-reference',
		severity: 'error',
		message: error.message,
		remediation:
			error.code === 'ambiguous'
				? `Use one canonical path: ${error.candidates.map((candidate) => candidate.relativePath).join(', ')}.`
				: 'Use the canonical repository-relative path of an existing entity.',
		received: error.reference,
		receivedType: 'string',
		expected: 'unique entity reference',
	}
}

/** Plans all canonical repairs in isolation, then publishes one optimistic file transaction. */
export async function syncRepository(
	repository: Repository,
	options: RepositorySyncOptions = {},
): Promise<RepositorySyncResult> {
	const validated = parseCoreInput(RepositorySchema, repository, 'repository sync')
	const preflight = await diagnoseRepository(validated)
	progress(options, 1, 5, 'preflight')
	const safelyRepairablePaths = new Set(
		preflight.diagnostics
			.filter((diagnostic) => diagnostic.code === 'invalid-reference-type')
			.map((diagnostic) => diagnostic.path)
			.filter((candidate): candidate is string => candidate !== undefined),
	)
	const blocking = preflight.diagnostics.filter(
		(diagnostic) =>
			diagnostic.severity === 'error' &&
			(!options.fix ||
				(!REPAIRABLE_CODES.has(diagnostic.code) &&
					!(
						diagnostic.code === 'schema' &&
						diagnostic.path !== undefined &&
						safelyRepairablePaths.has(diagnostic.path)
					))),
	)
	if (blocking.length > 0) throw new RepositorySyncError(blocking)

	const stageRoot = await mkdtemp(
		path.join(path.dirname(validated.rootDirectory), '.taskset-sync-'),
	)
	const staged = stagedRepository(validated, stageRoot)
	const changes: RepositorySyncChange[] = []
	let migrations: readonly TaskIdMigration[] = []
	let documentMigrations: readonly DocumentIdMigration[] = []
	try {
		await cp(validated.dataDirectory, staged.dataDirectory, { recursive: true })
		await ensureDirectories(staged)
		await ensureDataIgnore(staged)
		if (options.fix) await repairStagedFiles(staged, changes)
		progress(options, 2, 5, 'stage')

		const originalTargets: readonly EntityReferenceTarget[] = await targets(staged)
		const documentIds = (await listDocuments(staged)).map((record) => record.document.metadata.id)
		migrations = await migrateTaskIds(staged, {
			concurrency: options.concurrency,
			reservedIds: documentIds,
		})
		const taskIds = (await listTasks(staged)).map((record) => record.task.metadata.id)
		documentMigrations = await migrateDocumentIds(staged, {
			concurrency: options.concurrency,
			reservedIds: taskIds,
		})
		const finalTargets = aliasTargets(originalTargets, await targets(staged), [
			...migrations,
			...documentMigrations,
		])
		const referenceIndex = new EntityReferenceIndex(finalTargets)
		try {
			await canonicalizeRelationships(staged, referenceIndex, changes)
		} catch (error) {
			if (error instanceof EntityReferenceError)
				throw new RepositorySyncError([referenceDiagnostic(error)])
			throw error
		}
		await rewriteManagedProse(staged, referenceIndex, changes)
		progress(options, 3, 5, 'plan')

		const stagedDiagnostics = await diagnoseRepository(staged)
		if (!stagedDiagnostics.valid) throw new RepositorySyncError(stagedDiagnostics.diagnostics)
		const [before, after] = await Promise.all([canonicalFiles(validated), canonicalFiles(staged)])
		const allPaths = [...new Set([...before.keys(), ...after.keys()])].sort()
		const operations = allPaths
			.filter((relativePath) => before.get(relativePath) !== after.get(relativePath))
			.map((relativePath) => ({
				targetPath: path.join(validated.rootDirectory, relativePath),
				contents: after.get(relativePath) ?? null,
				expectedContents: before.get(relativePath) ?? null,
			}))
		for (const relativePath of allPaths) {
			const previous = before.get(relativePath)
			const next = after.get(relativePath)
			if (previous === next) continue
			changes.push({
				action: previous === undefined ? 'create' : next === undefined ? 'delete' : 'update',
				path: relativePath,
			})
		}
		if (operations.length > 0) {
			changes.push({
				action: 'rebuild-generated-views',
				path: '.taskset/**/.generated',
				detail: 'after canonical publication',
			})
		}
		const resultChanges = Object.freeze(
			changes.filter(
				(change, index, values) =>
					values.findIndex(
						(candidate) =>
							candidate.action === change.action &&
							candidate.path === change.path &&
							candidate.detail === change.detail,
					) === index,
			),
		)
		if (options.dryRun) {
			progress(options, 5, 5, 'publish')
			return Object.freeze({
				applied: false,
				migrations,
				documentMigrations,
				changes: resultChanges,
			})
		}
		await options.beforePublish?.()
		await Promise.all(
			operations
				.filter((operation) => operation.contents !== null)
				.map((operation) => mkdir(path.dirname(operation.targetPath), { recursive: true })),
		)
		await applyFileTransaction(operations)
		progress(options, 4, 5, 'publish')
		const generated = await generateViews(validated)
		progress(options, 5, 5, 'generated')
		return Object.freeze({
			applied: operations.length > 0,
			migrations,
			documentMigrations,
			changes: resultChanges,
			generated,
		})
	} finally {
		await rm(stageRoot, { recursive: true, force: true })
	}
}
