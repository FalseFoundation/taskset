import type { Dirent } from 'node:fs'
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { AsyncQueuer } from '@tanstack/pacer'
import {
	type DocumentFile,
	DocumentFileSchema,
	DocumentIdSchema,
	type DocumentKind,
	DocumentKindSchema,
	type DocumentStatus,
	DocumentStatusSchema,
	DocumentTimestampSchema,
	DocumentTitleSchema,
	TaskIdSchema,
	type TaskPriority,
	TaskPrioritySchema,
	type TaskRisk,
	TaskRiskSchema,
} from '@taskset/contracts'
import { formatDate, parseFrontmatter, serializeFrontmatter } from '@taskset/utils'
import * as z from 'zod'
import {
	DOCUMENT_DIRECTORY_NAMES,
	documentKindDirectory,
	type Repository,
	RepositorySchema,
} from '../config/config.ts'
import { buildDocumentGraph, DocumentGraphError } from '../graph/documentGraph.ts'
import { RepositoryRelativePathSchema } from '../projects/repositoryPath.ts'
import { atomicWriteFileExclusive } from '../repository/atomicWrite.ts'
import { applyFileTransaction, FileTransactionError } from '../repository/fileTransaction.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

export interface DocumentRecord {
	readonly relativePath: string
	readonly document: DocumentFile
}

const TrimmedStringSchema = z
	.string()
	.min(1)
	.refine((value) => value === value.trim(), 'Must not have surrounding whitespace')
function uniqueArray<T>(schema: z.ZodType<T>) {
	return z
		.array(schema)
		.refine((values) => new Set(values).size === values.length, 'Values must be unique')
}

const TaskIdListSchema = uniqueArray(TaskIdSchema)
const StringListSchema = uniqueArray(TrimmedStringSchema)
const RepositoryPathListSchema = uniqueArray(RepositoryRelativePathSchema)

export const CreateDocumentInputSchema = z.strictObject({
	type: DocumentKindSchema,
	title: DocumentTitleSchema,
	status: DocumentStatusSchema.optional(),
	priority: TaskPrioritySchema.optional(),
	order: z.number().finite().nonnegative().optional(),
	labels: StringListSchema.optional(),
	dependsOn: TaskIdListSchema.optional(),
	files: RepositoryPathListSchema.optional(),
	owner: TrimmedStringSchema.optional(),
	assignees: StringListSchema.optional(),
	reviewers: StringListSchema.optional(),
	team: TrimmedStringSchema.optional(),
	estimate: z.number().int().nonnegative().optional(),
	effort: z.number().finite().nonnegative().optional(),
	risk: TaskRiskSchema.optional(),
	dueDate: DocumentTimestampSchema.optional(),
	related: TaskIdListSchema.optional(),
	duplicates: TaskIdListSchema.optional(),
	parent: TaskIdSchema.optional(),
	directories: RepositoryPathListSchema.optional(),
	projects: StringListSchema.optional(),
	body: z.string().optional(),
})

export type CreateDocumentInput = z.infer<typeof CreateDocumentInputSchema>

export interface CreateDocumentOptions {
	readonly now?: () => Date
	readonly onWarning?: (warning: CoreWarning) => void
}

export const CreateDocumentOptionsSchema = z.strictObject({
	now: z.custom<() => Date>((value) => typeof value === 'function').optional(),
	onWarning: z
		.custom<(warning: CoreWarning) => void>((value) => typeof value === 'function')
		.optional(),
}) satisfies z.ZodType<CreateDocumentOptions>

export const UpdateDocumentInputSchema = z
	.strictObject({
		title: DocumentTitleSchema.optional(),
		status: DocumentStatusSchema.optional(),
		priority: TaskPrioritySchema.nullable().optional(),
		order: z.number().finite().nonnegative().nullable().optional(),
		labels: StringListSchema.optional(),
		dependsOn: TaskIdListSchema.optional(),
		files: RepositoryPathListSchema.optional(),
		owner: TrimmedStringSchema.nullable().optional(),
		assignees: StringListSchema.optional(),
		reviewers: StringListSchema.optional(),
		team: TrimmedStringSchema.nullable().optional(),
		estimate: z.number().int().nonnegative().nullable().optional(),
		effort: z.number().finite().nonnegative().nullable().optional(),
		risk: TaskRiskSchema.nullable().optional(),
		dueDate: DocumentTimestampSchema.nullable().optional(),
		related: TaskIdListSchema.optional(),
		duplicates: TaskIdListSchema.optional(),
		parent: TaskIdSchema.nullable().optional(),
		directories: RepositoryPathListSchema.optional(),
		projects: StringListSchema.optional(),
		body: z.string().optional(),
	})
	.refine((input) => Object.keys(input).length > 0, 'Document update requires at least one field')

export type UpdateDocumentInput = z.infer<typeof UpdateDocumentInputSchema>

export interface UpdateDocumentOptions {
	readonly now?: () => Date
	readonly onWarning?: (warning: CoreWarning) => void
}

export const UpdateDocumentOptionsSchema = z.strictObject({
	now: z.custom<() => Date>((value) => typeof value === 'function').optional(),
	onWarning: z
		.custom<(warning: CoreWarning) => void>((value) => typeof value === 'function')
		.optional(),
}) satisfies z.ZodType<UpdateDocumentOptions>

export interface DeleteDocumentOptions {
	readonly removeDependencies?: boolean
	readonly now?: () => Date
	readonly onWarning?: (warning: CoreWarning) => void
}

export const DeleteDocumentOptionsSchema = z.strictObject({
	removeDependencies: z.boolean().optional(),
	now: z.custom<() => Date>((value) => typeof value === 'function').optional(),
	onWarning: z
		.custom<(warning: CoreWarning) => void>((value) => typeof value === 'function')
		.optional(),
}) satisfies z.ZodType<DeleteDocumentOptions>

export interface ImportDocumentOptions {
	readonly type?: DocumentKind
	readonly title?: string
	readonly move?: boolean
}

export type DocumentBatchOperation =
	| { readonly action: 'create'; readonly input: CreateDocumentInput }
	| {
			readonly action: 'import'
			readonly sourcePath: string
			readonly options?: ImportDocumentOptions
	  }
	| {
			readonly action: 'update'
			readonly id: string
			readonly type?: DocumentKind
			readonly input: UpdateDocumentInput
	  }
	| {
			readonly action: 'export'
			readonly id: string
			readonly type?: DocumentKind
			readonly targetPath: string
			readonly overwrite?: boolean
	  }

export interface DocumentBatchProgress {
	readonly completed: number
	readonly total: number
	readonly percent: number
	readonly action: DocumentBatchOperation['action']
}

export interface DocumentBatchOptions {
	readonly concurrency?: number
	readonly onProgress?: (progress: DocumentBatchProgress) => void
}

export interface DocumentExportResult {
	readonly relativePath: string
}

export type DocumentBatchResult = DocumentRecord | DocumentExportResult

export interface CoreWarning {
	readonly code: 'generated-view-refresh'
	readonly message: string
	readonly cause?: unknown
}

export interface DocumentRepositoryIssue {
	readonly field: string
	readonly message: string
}

export type DocumentRepositoryErrorCode =
	| 'not-initialized'
	| 'document-exists'
	| 'document-invalid'
	| 'document-not-found'
	| 'document-ambiguous'
	| 'document-transition-invalid'
	| 'document-dependency-blocked'
	| 'document-stale'
	| 'document-read'
	| 'document-write'

export class DocumentRepositoryError extends Error {
	readonly code: DocumentRepositoryErrorCode
	readonly filePath?: string
	readonly documentId?: string
	readonly issues: readonly DocumentRepositoryIssue[]

	constructor(
		code: DocumentRepositoryErrorCode,
		message: string,
		options: {
			readonly cause?: unknown
			readonly filePath?: string
			readonly documentId?: string
			readonly issues?: readonly DocumentRepositoryIssue[]
		} = {},
	) {
		super(message, { cause: options.cause })
		this.name = 'DocumentRepositoryError'
		this.code = code
		this.filePath = options.filePath
		this.documentId = options.documentId
		this.issues = options.issues ?? []
	}
}

const KIND_ALIASES: Readonly<Record<string, DocumentKind>> = Object.freeze({
	story: 'story',
	stories: 'story',
	'user-story': 'story',
	flow: 'flow',
	flows: 'flow',
	'user-flow': 'flow',
	adr: 'decision',
	dr: 'decision',
	decision: 'decision',
	decisions: 'decision',
	research: 'research',
	runbook: 'runbook',
	runbooks: 'runbook',
})

const STATUS_TRANSITIONS: Readonly<Record<DocumentStatus, readonly DocumentStatus[]>> =
	Object.freeze({
		draft: Object.freeze<DocumentStatus[]>(['ready', 'active', 'archived']),
		ready: Object.freeze<DocumentStatus[]>(['draft', 'active', 'accepted', 'archived']),
		active: Object.freeze<DocumentStatus[]>(['ready', 'accepted', 'superseded', 'archived']),
		accepted: Object.freeze<DocumentStatus[]>(['superseded', 'archived']),
		superseded: Object.freeze<DocumentStatus[]>(['archived']),
		archived: Object.freeze<DocumentStatus[]>([]),
	})

export function normalizeDocumentKind(value: string): DocumentKind {
	const kind = KIND_ALIASES[value.toLowerCase()]
	if (!kind) throw new TypeError(`Unknown document type "${value}"`)
	return kind
}

export function slugifyDocumentTitle(title: string): string {
	const slug = title
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-|-$/gu, '')
		.slice(0, 72)
		.replace(/-$/u, '')
	return slug || 'untitled'
}

function schemaIssues(error: z.ZodError): readonly DocumentRepositoryIssue[] {
	return error.issues.map((issue) => ({
		field: issue.path.length > 0 ? issue.path.map(String).join('.') : 'input',
		message: issue.message,
	}))
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown, operation: string): T {
	const result = schema.safeParse(value)

	if (!result.success) {
		throw new DocumentRepositoryError('document-invalid', `Invalid ${operation} input`, {
			cause: result.error,
			issues: schemaIssues(result.error),
		})
	}

	return result.data
}

function parseDocumentId(documentId: string): string {
	return parseInput(DocumentIdSchema, documentId, 'document ID')
}

function resolveOptional<T>(next: T | null | undefined, current: T | undefined): T | undefined {
	return next === null ? undefined : (next ?? current)
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && error.code === code
}

function toRepositoryRelativePath(repository: Repository, absolutePath: string): string {
	return path.relative(repository.rootDirectory, absolutePath).split(path.sep).join('/')
}

function freezeRecord(relativePath: string, document: DocumentFile): DocumentRecord {
	return Object.freeze({ relativePath, document })
}

function defaultStatus(type: DocumentKind): DocumentStatus {
	return type === 'decision' ? 'accepted' : type === 'runbook' ? 'active' : 'draft'
}

function validateStatusTransition(current: DocumentStatus, next: DocumentStatus): void {
	if (current === next) {
		return
	}

	if (!STATUS_TRANSITIONS[current].includes(next)) {
		throw new DocumentRepositoryError(
			'document-transition-invalid',
			`Document status cannot transition from "${current}" to "${next}"`,
		)
	}
}

function validateConfiguredPriority(
	repository: Repository,
	priority: TaskPriority | undefined,
): void {
	if (priority && !repository.config.tasks.priorities.includes(priority)) {
		throw new DocumentRepositoryError(
			'document-invalid',
			`Priority "${priority}" is not enabled by taskset.config.ts`,
		)
	}
}

function mapGraphError(error: unknown): never {
	if (error instanceof DocumentGraphError) {
		const diagnostic = error.diagnostics[0]
		throw new DocumentRepositoryError(
			'document-invalid',
			diagnostic?.message ?? 'Document relationships are invalid',
			{
				cause: error,
				filePath: diagnostic?.path,
				documentId: diagnostic?.documentId,
			},
		)
	}

	throw error
}

function validateGraph(records: readonly DocumentRecord[]): void {
	try {
		buildDocumentGraph(records)
	} catch (error) {
		mapGraphError(error)
	}
}

async function refreshGeneratedViews(
	repository: Repository,
	onWarning: ((warning: CoreWarning) => void) | undefined,
): Promise<void> {
	try {
		const { generateViews } = await import('../generated/generatedViews.ts')
		await generateViews(repository)
	} catch (error) {
		onWarning?.(
			Object.freeze({
				code: 'generated-view-refresh',
				message: `Canonical document mutation succeeded, but generated views could not be refreshed: ${
					error instanceof Error ? error.message : 'unknown generation failure'
				}`,
				cause: error,
			}),
		)
	}
}

async function readDocumentContents(
	repository: Repository,
	record: DocumentRecord,
	documentId: string,
): Promise<string> {
	try {
		return await readFile(path.join(repository.rootDirectory, record.relativePath), 'utf8')
	} catch (error) {
		throw new DocumentRepositoryError(
			isNodeError(error, 'ENOENT') ? 'document-stale' : 'document-read',
			isNodeError(error, 'ENOENT')
				? `Document file disappeared before mutation: ${record.relativePath}`
				: `Failed to read document file ${record.relativePath}`,
			{ cause: error, filePath: record.relativePath, documentId },
		)
	}
}

export function documentTemplate(type: DocumentKind, title: string): string {
	const heading = `# ${title}\n\n`
	const templates: Record<DocumentKind, string> = {
		story:
			'## User story\n\nAs a …, I want …, so that ….\n\n## Context\n\n## Acceptance criteria\n\n- [ ] …\n\n## Out of scope\n\n## Notes\n',
		flow: '## Goal\n\n## Preconditions\n\n## User flow\n\n1. …\n\n## Failure variants\n\n## Acceptance checks\n\n- [ ] …\n\n## Related stories\n',
		decision:
			'## Context\n\n## Decision\n\n## Alternatives\n\n## Consequences\n\n## Migration\n\n## Status\n',
		research:
			'## Question\n\n## Sources\n\n## Findings\n\n## Recommendation\n\n## Open questions\n',
		runbook:
			'## Purpose\n\n## Preconditions\n\n## Symptoms\n\n## Checks\n\n1. …\n\n## Actions\n\n1. …\n\n## Rollback\n\n## Escalation\n\n## Verification\n',
	}
	return heading + templates[type]
}

export function parseDocumentFile(source: string): DocumentFile {
	const parsed = parseFrontmatter(source)
	return DocumentFileSchema.parse({ metadata: parsed.attributes, body: parsed.body })
}

export function serializeDocumentFile(document: DocumentFile): string {
	const parsed = DocumentFileSchema.parse(document)
	const { metadata } = parsed
	const orderedMetadata: Record<string, unknown> = {
		id: metadata.id,
		type: metadata.type,
		title: metadata.title,
		status: metadata.status,
	}

	if (metadata.priority !== undefined) {
		orderedMetadata.priority = metadata.priority
	}
	if (metadata.order !== undefined) {
		orderedMetadata.order = metadata.order
	}
	if (metadata.owner !== undefined) {
		orderedMetadata.owner = metadata.owner
	}
	if (metadata.assignees !== undefined) {
		orderedMetadata.assignees = metadata.assignees
	}
	if (metadata.reviewers !== undefined) {
		orderedMetadata.reviewers = metadata.reviewers
	}
	if (metadata.team !== undefined) {
		orderedMetadata.team = metadata.team
	}
	if (metadata.estimate !== undefined) {
		orderedMetadata.estimate = metadata.estimate
	}
	if (metadata.effort !== undefined) {
		orderedMetadata.effort = metadata.effort
	}
	if (metadata.risk !== undefined) {
		orderedMetadata.risk = metadata.risk
	}
	if (metadata.dueDate !== undefined) {
		orderedMetadata.dueDate = metadata.dueDate
	}

	orderedMetadata.createdAt = metadata.createdAt
	orderedMetadata.updatedAt = metadata.updatedAt

	if (metadata.labels !== undefined) {
		orderedMetadata.labels = metadata.labels
	}
	if (metadata.dependsOn !== undefined) {
		orderedMetadata.dependsOn = metadata.dependsOn
	}
	if (metadata.related !== undefined) {
		orderedMetadata.related = metadata.related
	}
	if (metadata.duplicates !== undefined) {
		orderedMetadata.duplicates = metadata.duplicates
	}
	if (metadata.parent !== undefined) {
		orderedMetadata.parent = metadata.parent
	}
	if (metadata.files !== undefined) {
		orderedMetadata.files = metadata.files
	}
	if (metadata.directories !== undefined) {
		orderedMetadata.directories = metadata.directories
	}
	if (metadata.projects !== undefined) {
		orderedMetadata.projects = metadata.projects
	}

	return serializeFrontmatter(orderedMetadata, parsed.body)
}

async function nextId(repository: Repository, type: DocumentKind, title: string): Promise<string> {
	let entries: Dirent<string>[] = []
	try {
		entries = await readdir(documentKindDirectory(repository, type), { withFileTypes: true })
	} catch {
		// Directory may not exist yet for a freshly initialized kind.
	}
	const maximum = entries.reduce((value, entry) => {
		const match = /^(\d{7})-/u.exec(entry.name)
		return Math.max(value, match ? Number(match[1]) : 0)
	}, 0)
	return `${String(maximum + 1).padStart(7, '0')}-${slugifyDocumentTitle(title)}`
}

export async function listDocuments(
	repository: Repository,
	type?: DocumentKind,
): Promise<readonly DocumentRecord[]> {
	const validatedRepository = parseCoreInput(RepositorySchema, repository, 'document repository')
	const kinds = type
		? [DocumentKindSchema.parse(type)]
		: (Object.keys(DOCUMENT_DIRECTORY_NAMES) as DocumentKind[])
	const records: DocumentRecord[] = []
	const documentIds = new Map<string, string>()

	for (const kind of kinds) {
		const directory = documentKindDirectory(validatedRepository, kind)
		let entries: Dirent<string>[] = []
		try {
			entries = await readdir(directory, { withFileTypes: true })
		} catch {
			continue
		}
		for (const entry of entries
			.filter((item) => item.isFile() && item.name.endsWith('.md'))
			.sort((a, b) => a.name.localeCompare(b.name))) {
			const absolutePath = path.join(directory, entry.name)
			const relativePath = toRepositoryRelativePath(validatedRepository, absolutePath)
			try {
				const document = parseDocumentFile(await readFile(absolutePath, 'utf8'))
				const existingPath = documentIds.get(document.metadata.id)
				if (existingPath) {
					throw new DocumentRepositoryError(
						'document-invalid',
						`Duplicate document ID ${document.metadata.id} exists in ${existingPath} and ${relativePath}`,
						{ filePath: relativePath, documentId: document.metadata.id },
					)
				}
				documentIds.set(document.metadata.id, relativePath)
				records.push(freezeRecord(relativePath, document))
			} catch (error) {
				if (error instanceof DocumentRepositoryError) {
					throw error
				}
				throw new DocumentRepositoryError(
					'document-read',
					`Failed to read document file ${relativePath}`,
					{ cause: error, filePath: relativePath },
				)
			}
		}
	}

	return Object.freeze(
		records.sort((left, right) =>
			left.document.metadata.id.localeCompare(right.document.metadata.id),
		),
	)
}

export async function readDocument(
	repository: Repository,
	id: string,
	type?: DocumentKind,
): Promise<DocumentRecord> {
	parseCoreInput(RepositorySchema, repository, 'document read repository')
	const validatedId = parseDocumentId(id)
	const matches = (await listDocuments(repository, type)).filter(
		(item) => item.document.metadata.id === validatedId,
	)
	if (matches.length === 0) {
		throw new DocumentRepositoryError(
			'document-not-found',
			`Document ${validatedId} was not found`,
			{
				documentId: validatedId,
			},
		)
	}
	if (matches.length > 1) {
		throw new DocumentRepositoryError(
			'document-ambiguous',
			`Document ${validatedId} is ambiguous; specify its document type`,
			{ documentId: validatedId },
		)
	}
	return matches[0] as DocumentRecord
}

/**
 * Creates a canonical document after applying type defaults and validating the
 * resulting graph across all document collections. Cache and view refresh are
 * best effort.
 */
export async function createDocument(
	repository: Repository,
	input: CreateDocumentInput,
	options: CreateDocumentOptions = {},
): Promise<DocumentRecord> {
	const validatedRepository = parseCoreInput(RepositorySchema, repository, 'document repository')
	const validatedInput = parseInput(CreateDocumentInputSchema, input, 'document creation')
	const validatedOptions = parseCoreInput(
		CreateDocumentOptionsSchema,
		options,
		'document creation options',
	)
	const type = validatedInput.type
	const title = validatedInput.title
	const status = validatedInput.status ?? defaultStatus(type)
	const priority = validatedInput.priority
	validateConfiguredPriority(validatedRepository, priority)
	const id = await nextId(validatedRepository, type, title)
	const timestamp = formatDate(validatedOptions.now?.() ?? new Date())
	const document = DocumentFileSchema.parse({
		metadata: {
			id,
			type,
			title,
			status,
			...(priority ? { priority } : {}),
			...(validatedInput.order !== undefined ? { order: validatedInput.order } : {}),
			...(validatedInput.owner ? { owner: validatedInput.owner } : {}),
			...(validatedInput.assignees?.length ? { assignees: validatedInput.assignees } : {}),
			...(validatedInput.reviewers?.length ? { reviewers: validatedInput.reviewers } : {}),
			...(validatedInput.team ? { team: validatedInput.team } : {}),
			...(validatedInput.estimate !== undefined ? { estimate: validatedInput.estimate } : {}),
			...(validatedInput.effort !== undefined ? { effort: validatedInput.effort } : {}),
			...(validatedInput.risk ? { risk: validatedInput.risk } : {}),
			...(validatedInput.dueDate ? { dueDate: validatedInput.dueDate } : {}),
			createdAt: timestamp,
			updatedAt: timestamp,
			...(validatedInput.labels?.length ? { labels: validatedInput.labels } : {}),
			...(validatedInput.dependsOn?.length ? { dependsOn: validatedInput.dependsOn } : {}),
			...(validatedInput.related?.length ? { related: validatedInput.related } : {}),
			...(validatedInput.duplicates?.length ? { duplicates: validatedInput.duplicates } : {}),
			...(validatedInput.parent ? { parent: validatedInput.parent } : {}),
			...(validatedInput.files?.length ? { files: validatedInput.files } : {}),
			...(validatedInput.directories?.length ? { directories: validatedInput.directories } : {}),
			...(validatedInput.projects?.length ? { projects: validatedInput.projects } : {}),
		},
		body: validatedInput.body ?? documentTemplate(type, title),
	})
	const absolutePath = path.join(documentKindDirectory(validatedRepository, type), `${id}.md`)
	const relativePath = toRepositoryRelativePath(validatedRepository, absolutePath)
	const contents = serializeDocumentFile(document)
	const parsedDocument = parseDocumentFile(contents)
	const existingRecords = await listDocuments(validatedRepository)
	if (existingRecords.some((record) => record.document.metadata.id === id)) {
		throw new DocumentRepositoryError('document-exists', `Document ${id} already exists`, {
			filePath: relativePath,
			documentId: id,
		})
	}
	validateGraph([...existingRecords, freezeRecord(relativePath, parsedDocument)])

	await mkdir(path.dirname(absolutePath), { recursive: true })
	try {
		await atomicWriteFileExclusive(absolutePath, contents)
	} catch (error) {
		if (isNodeError(error, 'EEXIST')) {
			throw new DocumentRepositoryError('document-exists', `Document ${id} already exists`, {
				cause: error,
				filePath: relativePath,
				documentId: id,
			})
		}
		throw error
	}

	await refreshGeneratedViews(validatedRepository, validatedOptions.onWarning)
	return freezeRecord(relativePath, parsedDocument)
}

function titleFromMarkdown(source: string, sourcePath: string): string {
	const body = source.startsWith('---\n') ? parseFrontmatter(source).body : source
	const heading = /^#\s+(?:[A-Z]+-?\d+:\s*)?(.+)$/mu.exec(body)?.[1]?.trim()
	return (
		heading ||
		path
			.basename(sourcePath, path.extname(sourcePath))
			.replace(/^\d+[-_]?/u, '')
			.replace(/[-_]+/gu, ' ')
	)
}

export async function importDocument(
	repository: Repository,
	sourcePath: string,
	options: ImportDocumentOptions = {},
): Promise<DocumentRecord> {
	const absoluteSource = path.resolve(repository.rootDirectory, z.string().min(1).parse(sourcePath))
	const source = await readFile(absoluteSource, 'utf8')
	const parent = path.basename(path.dirname(absoluteSource))
	const type = options.type ?? normalizeDocumentKind(parent)
	const rawBody = source.startsWith('---\n') ? parseFrontmatter(source).body : source
	const record = await createDocument(repository, {
		type,
		title: options.title ?? titleFromMarkdown(source, absoluteSource),
		body: rawBody,
	})
	if (options.move) await unlink(absoluteSource)
	return record
}

/**
 * Atomically updates document metadata or Markdown while preserving unspecified
 * values, enforcing lifecycle transitions, and revalidating the full graph.
 */
export async function updateDocument(
	repository: Repository,
	id: string,
	input: UpdateDocumentInput,
	type?: DocumentKind,
	options: UpdateDocumentOptions = {},
): Promise<DocumentRecord> {
	const validatedRepository = parseCoreInput(
		RepositorySchema,
		repository,
		'document update repository',
	)
	const validatedId = parseDocumentId(id)
	const validatedInput = parseInput(UpdateDocumentInputSchema, input, 'document update')
	const validatedOptions = parseCoreInput(
		UpdateDocumentOptionsSchema,
		options,
		'document update options',
	)
	const records = await listDocuments(validatedRepository)
	const existing = type
		? records.find(
				(record) =>
					record.document.metadata.id === validatedId && record.document.metadata.type === type,
			)
		: records.find((record) => record.document.metadata.id === validatedId)

	if (!existing) {
		throw new DocumentRepositoryError(
			'document-not-found',
			`Document ${validatedId} was not found`,
			{
				documentId: validatedId,
			},
		)
	}

	if (!type && records.filter((record) => record.document.metadata.id === validatedId).length > 1) {
		throw new DocumentRepositoryError(
			'document-ambiguous',
			`Document ${validatedId} is ambiguous; specify its document type`,
			{ documentId: validatedId },
		)
	}

	const absolutePath = path.join(validatedRepository.rootDirectory, existing.relativePath)
	const originalContents = await readDocumentContents(validatedRepository, existing, validatedId)
	const current = parseDocumentFile(originalContents)

	if (current.metadata.id !== validatedId) {
		throw new DocumentRepositoryError(
			'document-stale',
			`Document file ${existing.relativePath} changed identity before update`,
			{ filePath: existing.relativePath, documentId: validatedId },
		)
	}

	const nextStatus = validatedInput.status ?? current.metadata.status
	const nextPriority =
		validatedInput.priority === null
			? undefined
			: (validatedInput.priority ?? current.metadata.priority)
	validateStatusTransition(current.metadata.status, nextStatus)
	validateConfiguredPriority(validatedRepository, nextPriority)

	const updatedDocument: DocumentFile = {
		metadata: {
			...current.metadata,
			...(validatedInput.title !== undefined ? { title: validatedInput.title } : {}),
			status: nextStatus,
			...(nextPriority !== undefined ? { priority: nextPriority } : { priority: undefined }),
			order: resolveOptional(validatedInput.order, current.metadata.order),
			owner: resolveOptional(validatedInput.owner, current.metadata.owner),
			assignees: validatedInput.assignees ?? current.metadata.assignees,
			reviewers: validatedInput.reviewers ?? current.metadata.reviewers,
			team: resolveOptional(validatedInput.team, current.metadata.team),
			estimate: resolveOptional(validatedInput.estimate, current.metadata.estimate),
			effort: resolveOptional(validatedInput.effort, current.metadata.effort),
			risk: resolveOptional<TaskRisk>(validatedInput.risk, current.metadata.risk),
			dueDate: resolveOptional(validatedInput.dueDate, current.metadata.dueDate),
			updatedAt: formatDate(validatedOptions.now?.() ?? new Date()),
			...(validatedInput.labels !== undefined ? { labels: validatedInput.labels } : {}),
			...(validatedInput.dependsOn !== undefined ? { dependsOn: validatedInput.dependsOn } : {}),
			related: validatedInput.related ?? current.metadata.related,
			duplicates: validatedInput.duplicates ?? current.metadata.duplicates,
			parent: resolveOptional(validatedInput.parent, current.metadata.parent),
			...(validatedInput.files !== undefined ? { files: validatedInput.files } : {}),
			directories: validatedInput.directories ?? current.metadata.directories,
			projects: validatedInput.projects ?? current.metadata.projects,
		},
		body: validatedInput.body ?? current.body,
	}
	const contents = serializeDocumentFile(updatedDocument)
	const parsedDocument = parseDocumentFile(contents)
	const updatedRecord = freezeRecord(existing.relativePath, parsedDocument)
	validateGraph(records.map((record) => (record === existing ? updatedRecord : record)))

	try {
		await applyFileTransaction([
			{
				targetPath: absolutePath,
				contents,
				expectedContents: originalContents,
			},
		])
	} catch (error) {
		if (error instanceof FileTransactionError) {
			throw new DocumentRepositoryError(
				error.code === 'stale' ? 'document-stale' : 'document-write',
				error.message,
				{ cause: error, filePath: existing.relativePath, documentId: validatedId },
			)
		}
		throw error
	}

	await refreshGeneratedViews(validatedRepository, validatedOptions.onWarning)
	return updatedRecord
}

/**
 * Atomically deletes a document. Inbound canonical relationships block deletion
 * unless `removeDependencies` requests their transactional repair.
 */
export async function deleteDocument(
	repository: Repository,
	id: string,
	type?: DocumentKind,
	options: DeleteDocumentOptions = {},
): Promise<DocumentRecord> {
	const validatedRepository = parseCoreInput(
		RepositorySchema,
		repository,
		'document deletion repository',
	)
	const validatedId = parseDocumentId(id)
	const validatedOptions = parseCoreInput(
		DeleteDocumentOptionsSchema,
		options,
		'document deletion options',
	)
	const records = await listDocuments(validatedRepository)
	const matches = records.filter((record) => record.document.metadata.id === validatedId)
	const existing = type
		? matches.find((record) => record.document.metadata.type === type)
		: matches[0]

	if (!existing) {
		throw new DocumentRepositoryError(
			'document-not-found',
			`Document ${validatedId} was not found`,
			{
				documentId: validatedId,
			},
		)
	}

	if (!type && matches.length > 1) {
		throw new DocumentRepositoryError(
			'document-ambiguous',
			`Document ${validatedId} is ambiguous; specify its document type`,
			{ documentId: validatedId },
		)
	}

	const inboundReferences = records.filter((record) => {
		if (record.document.metadata.id === validatedId) {
			return false
		}

		const { metadata } = record.document
		return (
			metadata.dependsOn?.includes(validatedId) === true ||
			metadata.related?.includes(validatedId) === true ||
			metadata.duplicates?.includes(validatedId) === true ||
			metadata.parent === validatedId
		)
	})

	if (inboundReferences.length > 0 && !validatedOptions.removeDependencies) {
		throw new DocumentRepositoryError(
			'document-dependency-blocked',
			`Document ${validatedId} cannot be deleted because it is referenced by ${inboundReferences
				.map((record) => record.document.metadata.id)
				.join(', ')}; use removeDependencies to repair inbound relationships`,
			{ documentId: validatedId, filePath: existing.relativePath },
		)
	}

	const timestamp = formatDate(validatedOptions.now?.() ?? new Date())
	const possibleRepairs = await Promise.all(
		inboundReferences.map(async (record) => {
			const absolutePath = path.join(validatedRepository.rootDirectory, record.relativePath)
			const originalContents = await readDocumentContents(
				validatedRepository,
				record,
				record.document.metadata.id,
			)
			const currentDocument = parseDocumentFile(originalContents)
			const repairedDocument: DocumentFile = {
				metadata: {
					...currentDocument.metadata,
					updatedAt: timestamp,
					dependsOn: currentDocument.metadata.dependsOn?.filter(
						(dependencyId) => dependencyId !== validatedId,
					),
					related: currentDocument.metadata.related?.filter(
						(relatedId) => relatedId !== validatedId,
					),
					duplicates: currentDocument.metadata.duplicates?.filter(
						(duplicateId) => duplicateId !== validatedId,
					),
					parent:
						currentDocument.metadata.parent === validatedId
							? undefined
							: currentDocument.metadata.parent,
				},
				body: currentDocument.body,
			}

			return {
				targetPath: absolutePath,
				contents: serializeDocumentFile(repairedDocument),
				expectedContents: originalContents,
			}
		}),
	)
	const existingAbsolutePath = path.join(validatedRepository.rootDirectory, existing.relativePath)
	const existingContents = await readDocumentContents(validatedRepository, existing, validatedId)
	const currentTarget = parseDocumentFile(existingContents)

	if (currentTarget.metadata.id !== validatedId) {
		throw new DocumentRepositoryError(
			'document-stale',
			`Document file ${existing.relativePath} changed identity before deletion`,
			{ filePath: existing.relativePath, documentId: validatedId },
		)
	}

	try {
		await applyFileTransaction([
			...possibleRepairs,
			{
				targetPath: existingAbsolutePath,
				contents: null,
				expectedContents: existingContents,
			},
		])
	} catch (error) {
		if (error instanceof FileTransactionError) {
			throw new DocumentRepositoryError(
				error.code === 'stale' ? 'document-stale' : 'document-write',
				error.message,
				{ cause: error, filePath: existing.relativePath, documentId: validatedId },
			)
		}
		throw error
	}

	await refreshGeneratedViews(validatedRepository, validatedOptions.onWarning)
	return existing
}

export async function exportDocument(
	repository: Repository,
	id: string,
	targetPath: string,
	options: { readonly type?: DocumentKind; readonly overwrite?: boolean } = {},
): Promise<DocumentExportResult> {
	const validatedRepository = parseCoreInput(
		RepositorySchema,
		repository,
		'document export repository',
	)
	const record = await readDocument(validatedRepository, id, options.type)
	const absolutePath = path.resolve(
		validatedRepository.rootDirectory,
		z.string().min(1).parse(targetPath),
	)
	await mkdir(path.dirname(absolutePath), { recursive: true })
	const contents = serializeDocumentFile(record.document)
	if (!options.overwrite) await atomicWriteFileExclusive(absolutePath, contents)
	else {
		let expectedContents: string | null = null
		try {
			expectedContents = await readFile(absolutePath, 'utf8')
		} catch {
			// Target may not exist yet.
		}
		await applyFileTransaction([{ targetPath: absolutePath, contents, expectedContents }])
	}
	return Object.freeze({
		relativePath: toRepositoryRelativePath(validatedRepository, absolutePath),
	})
}

/** Executes bulk document work through TanStack Pacer with bounded concurrency. */
export async function executeDocumentBatch(
	repository: Repository,
	operations: readonly DocumentBatchOperation[],
	options: DocumentBatchOptions = {},
): Promise<readonly DocumentBatchResult[]> {
	if (operations.length === 0) return Object.freeze([])
	const concurrency = z
		.number()
		.int()
		.min(1)
		.max(32)
		.parse(options.concurrency ?? 4)
	const results: DocumentBatchResult[] = new Array(operations.length)
	let completed = 0
	let firstError: Error | undefined
	let mutationTail: Promise<unknown> = Promise.resolve()
	const serializeMutation = <T>(work: () => Promise<T>): Promise<T> => {
		const result = mutationTail.then(work, work)
		mutationTail = result.then(
			() => undefined,
			() => undefined,
		)
		return result
	}

	await new Promise<void>((resolve) => {
		const queue = new AsyncQueuer<{
			readonly index: number
			readonly operation: DocumentBatchOperation
		}>(
			async ({ index, operation }) => {
				const run = async (): Promise<DocumentBatchResult> => {
					switch (operation.action) {
						case 'create':
							return createDocument(repository, operation.input)
						case 'import':
							return importDocument(repository, operation.sourcePath, operation.options)
						case 'update':
							return updateDocument(repository, operation.id, operation.input, operation.type)
						case 'export':
							return exportDocument(repository, operation.id, operation.targetPath, {
								type: operation.type,
								overwrite: operation.overwrite,
							})
					}
				}
				results[index] = operation.action === 'export' ? await run() : await serializeMutation(run)
			},
			{
				concurrency,
				started: false,
				throwOnError: false,
				onError: (error) => {
					firstError ??= error
				},
				onSettled: ({ operation }) => {
					completed += 1
					options.onProgress?.({
						completed,
						total: operations.length,
						percent: Math.round((completed / operations.length) * 100),
						action: operation.action,
					})
					if (completed === operations.length) resolve()
				},
			},
		)
		operations.forEach((operation, index) => {
			queue.addItem({ index, operation }, 'back', false)
		})
		queue.start()
	})
	if (firstError) throw firstError
	return Object.freeze(results)
}
