import type { Dirent } from 'node:fs'
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { AsyncQueuer } from '@tanstack/pacer'
import {
	type ConcernClass,
	ConcernClassSchema,
	type DocumentFile,
	DocumentFileSchema,
	type DocumentKind,
	DocumentKindSchema,
	type DocumentStatus,
	DocumentStatusSchema,
	DocumentTimestampSchema,
	DocumentTitleSchema,
	EntityReferenceSchema,
	type LessonSeverity,
	LessonSeveritySchema,
	needsEntityIdMigration,
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
import {
	assertEntityFileNameMatchesId,
	generateEntityId,
	nextEntitySequence,
	planEntitySequences,
	resolveEntityFileName,
	slugifyTitle,
} from '../ids/entityId.ts'
import {
	EntityReferenceError,
	EntityReferenceIndex,
	type EntityReferenceTarget,
	normalizeEntityReference,
} from '../ids/entityReference.ts'
import { RepositoryRelativePathSchema } from '../projects/repositoryPath.ts'
import { atomicWriteFileExclusive } from '../repository/atomicWrite.ts'
import { applyFileTransaction, FileTransactionError } from '../repository/fileTransaction.ts'
import { listTasks, type TaskRecord } from '../tasks/taskRepository.ts'
import { collectTaxonomyViolations } from '../taxonomy/taxonomy.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'
import { missingDocumentHeadings } from './documentTemplate.ts'

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

const TaskIdListSchema = uniqueArray(EntityReferenceSchema)
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
	parent: EntityReferenceSchema.optional(),
	directories: RepositoryPathListSchema.optional(),
	projects: StringListSchema.optional(),
	severity: LessonSeveritySchema.optional(),
	relatedSkills: StringListSchema.optional(),
	packs: StringListSchema.optional(),
	class: ConcernClassSchema.optional(),
	cadence: TrimmedStringSchema.optional(),
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
		parent: EntityReferenceSchema.nullable().optional(),
		directories: RepositoryPathListSchema.optional(),
		projects: StringListSchema.optional(),
		severity: LessonSeveritySchema.nullable().optional(),
		relatedSkills: StringListSchema.optional(),
		packs: StringListSchema.optional(),
		class: ConcernClassSchema.nullable().optional(),
		cadence: TrimmedStringSchema.nullable().optional(),
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
	lesson: 'lesson',
	lessons: 'lesson',
	antipattern: 'lesson',
	antipatterns: 'lesson',
	concern: 'concern',
	concerns: 'concern',
	audit: 'audit',
	audits: 'audit',
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
	return slugifyTitle(title)
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

function documentReferenceTarget(record: DocumentRecord): EntityReferenceTarget {
	return {
		id: record.document.metadata.id,
		relativePath: record.relativePath,
		title: record.document.metadata.title,
		kind: record.document.metadata.type,
		status: record.document.metadata.status,
	}
}

function taskReferenceTarget(record: TaskRecord): EntityReferenceTarget {
	return {
		id: record.task.metadata.id,
		relativePath: record.relativePath,
		title: record.task.metadata.title,
		kind: 'task',
		status: record.task.metadata.status,
	}
}

function normalizedDocumentFile(document: DocumentFile, index: EntityReferenceIndex): DocumentFile {
	const map = (values: readonly string[] | undefined) =>
		values?.map((value) => normalizeEntityReference(value, index))
	const metadata = document.metadata
	return DocumentFileSchema.parse({
		metadata: {
			...metadata,
			dependsOn: map(metadata.dependsOn),
			related: map(metadata.related),
			duplicates: map(metadata.duplicates),
			parent: metadata.parent ? normalizeEntityReference(metadata.parent, index) : undefined,
		},
		body: document.body,
	})
}

function resolveDocumentInputReferences<T extends CreateDocumentInput | UpdateDocumentInput>(
	input: T,
	index: EntityReferenceIndex,
): T {
	const resolve = (values: readonly string[] | undefined, requireLocal: boolean) => {
		if (values === undefined) return undefined
		return values.map((value) => {
			const candidates = index.find(value)
			if (candidates.length === 1) return candidates[0]?.id as string
			if (candidates.length > 1) throw new EntityReferenceError('ambiguous', value, candidates)
			const normalized = normalizeEntityReference(value)
			if (!requireLocal && TaskIdSchema.safeParse(normalized).success) return normalized
			throw new EntityReferenceError('missing', value)
		})
	}
	try {
		return {
			...input,
			dependsOn: resolve(input.dependsOn, true),
			related: resolve(input.related, false),
			duplicates: resolve(input.duplicates, false),
			parent: typeof input.parent === 'string' ? index.resolveId(input.parent) : input.parent,
		} as T
	} catch (error) {
		if (error instanceof EntityReferenceError) {
			throw new DocumentRepositoryError('document-invalid', error.message, {
				issues: [{ field: 'relationship', message: error.message }],
			})
		}
		throw error
	}
}

async function repositoryReferenceIndex(
	repository: Repository,
	documents: readonly DocumentRecord[],
): Promise<EntityReferenceIndex> {
	const tasks = await listTasks(repository)
	return new EntityReferenceIndex([
		...documents.map(documentReferenceTarget),
		...tasks.map(taskReferenceTarget),
	])
}

function defaultStatus(type: DocumentKind): DocumentStatus {
	if (type === 'decision') {
		return 'accepted'
	}
	if (type === 'runbook' || type === 'lesson' || type === 'concern') {
		return 'active'
	}
	return 'draft'
}

function validateDocumentBody(type: DocumentKind, body: string): void {
	// Preserve the existing import/update compatibility contract for the older
	// document kinds. Repository preflight and doctor still report every
	// missing heading across all kinds before sync can publish changes.
	if (type !== 'lesson' && type !== 'concern' && type !== 'audit') return
	const missing = missingDocumentHeadings(type, body)
	if (missing.length === 0) {
		return
	}

	throw new DocumentRepositoryError(
		'document-invalid',
		`Document body is missing required headings: ${missing.join(', ')}`,
		{
			issues: missing.map((heading) => ({
				field: 'body',
				message: `Missing required heading "## ${heading}"`,
			})),
		},
	)
}

function validateDocumentTaxonomy(
	repository: Repository,
	metadata: {
		readonly labels?: readonly string[]
		readonly projects?: readonly string[]
		readonly class?: ConcernClass
	},
): void {
	const violations = collectTaxonomyViolations(repository.config.taxonomy, metadata)
	if (violations.length === 0) {
		return
	}

	if (repository.config.taxonomy.mode === 'warn') {
		return
	}

	throw new DocumentRepositoryError(
		'document-invalid',
		'Document taxonomy values are not allowed',
		{
			issues: violations.map((violation) => ({
				field: violation.field,
				message: violation.message,
			})),
		},
	)
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
			`Priority "${priority}" is not enabled by repository configuration`,
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
		lesson:
			'## Trigger / symptom\n\n## Incorrect pattern\n\n## Correct pattern\n\n## Blast radius / severity\n\n## Prevention\n\n## Evidence\n',
		concern:
			'## Summary\n\n## Class\n\n## Trust boundary / plane\n\n## Current evidence\n\n## Residual risk\n\n## Mitigation plan / acceptance rationale\n\n## Review cadence\n',
		audit:
			'## Scope\n\n## Method\n\n## Findings\n\n`pass` | `fail` | `residual`\n\n## Residual items\n\n## Required follow-ups\n\n## Next due date\n',
	}
	return heading + templates[type]
}

export function parseDocumentFile(source: string): DocumentFile {
	const parsed = parseFrontmatter(source)
	return DocumentFileSchema.parse({ metadata: parsed.attributes, body: parsed.body })
}

export function serializeDocumentFile(
	document: DocumentFile,
	options: { readonly referencePathForId?: (id: string) => string | undefined } = {},
): string {
	const parsed = DocumentFileSchema.parse(document)
	const { metadata } = parsed
	const reference = (value: string): string => options.referencePathForId?.(value) ?? value
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
		orderedMetadata.dependsOn = metadata.dependsOn.map(reference)
	}
	if (metadata.related !== undefined) {
		orderedMetadata.related = metadata.related.map(reference)
	}
	if (metadata.duplicates !== undefined) {
		orderedMetadata.duplicates = metadata.duplicates.map(reference)
	}
	if (metadata.parent !== undefined) {
		orderedMetadata.parent = reference(metadata.parent)
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
	if (metadata.severity !== undefined) {
		orderedMetadata.severity = metadata.severity
	}
	if (metadata.relatedSkills !== undefined) {
		orderedMetadata.relatedSkills = metadata.relatedSkills
	}
	if (metadata.packs !== undefined) {
		orderedMetadata.packs = metadata.packs
	}
	if (metadata.class !== undefined) {
		orderedMetadata.class = metadata.class
	}
	if (metadata.cadence !== undefined) {
		orderedMetadata.cadence = metadata.cadence
	}

	return serializeFrontmatter(orderedMetadata, parsed.body)
}

async function allocateDocumentIdentity(
	repository: Repository,
	type: DocumentKind,
	title: string,
	occupiedIds: ReadonlySet<string>,
): Promise<{ readonly id: string; readonly fileName: string }> {
	let entries: Dirent<string>[] = []
	try {
		entries = await readdir(documentKindDirectory(repository, type), { withFileTypes: true })
	} catch {
		// Directory may not exist yet for a freshly initialized kind.
	}
	const fileNames = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
		.map((entry) => entry.name)
	const id = generateEntityId(occupiedIds)
	const sequence = nextEntitySequence(fileNames)
	return {
		id,
		fileName: resolveEntityFileName({ id, title, sequence }),
	}
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
				try {
					assertEntityFileNameMatchesId(entry.name, document.metadata.id)
				} catch (error) {
					throw new DocumentRepositoryError(
						'document-invalid',
						error instanceof Error ? error.message : 'Document filename does not match its id',
						{ filePath: relativePath, documentId: document.metadata.id },
					)
				}
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

	const orderedRecords = records.sort(
		(left, right) =>
			left.relativePath.localeCompare(right.relativePath) ||
			left.document.metadata.id.localeCompare(right.document.metadata.id),
	)
	const referenceIndex = new EntityReferenceIndex(orderedRecords.map(documentReferenceTarget))
	return Object.freeze(
		orderedRecords.map((record) =>
			freezeRecord(record.relativePath, normalizedDocumentFile(record.document, referenceIndex)),
		),
	)
}

export async function readDocument(
	repository: Repository,
	id: string,
	type?: DocumentKind,
): Promise<DocumentRecord> {
	parseCoreInput(RepositorySchema, repository, 'document read repository')
	const records = await listDocuments(repository, type)
	let validatedId: string
	try {
		validatedId = new EntityReferenceIndex(records.map(documentReferenceTarget)).resolveId(id)
	} catch (error) {
		if (error instanceof EntityReferenceError)
			throw new DocumentRepositoryError(
				error.code === 'ambiguous' ? 'document-ambiguous' : 'document-not-found',
				error.message,
				{ documentId: id },
			)
		throw error
	}
	const matches = records.filter((item) => item.document.metadata.id === validatedId)
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
	const parsedInput = parseInput(CreateDocumentInputSchema, input, 'document creation')
	const validatedOptions = parseCoreInput(
		CreateDocumentOptionsSchema,
		options,
		'document creation options',
	)
	const existingRecords = await listDocuments(validatedRepository)
	const referenceIndex = await repositoryReferenceIndex(validatedRepository, existingRecords)
	const validatedInput = resolveDocumentInputReferences(parsedInput, referenceIndex)
	const type = validatedInput.type
	const title = validatedInput.title
	const status = validatedInput.status ?? defaultStatus(type)
	const priority = validatedInput.priority
	validateConfiguredPriority(validatedRepository, priority)
	validateDocumentTaxonomy(validatedRepository, {
		...(validatedInput.labels ? { labels: validatedInput.labels } : {}),
		...(validatedInput.projects ? { projects: validatedInput.projects } : {}),
		...(validatedInput.class ? { class: validatedInput.class } : {}),
	})
	const body = validatedInput.body ?? documentTemplate(type, title)
	validateDocumentBody(type, body)
	const occupiedIds = new Set(existingRecords.map((record) => record.document.metadata.id))
	const { id, fileName } = await allocateDocumentIdentity(
		validatedRepository,
		type,
		title,
		occupiedIds,
	)
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
			...(validatedInput.severity ? { severity: validatedInput.severity } : {}),
			...(validatedInput.relatedSkills?.length
				? { relatedSkills: validatedInput.relatedSkills }
				: {}),
			...(validatedInput.packs?.length ? { packs: validatedInput.packs } : {}),
			...(validatedInput.class ? { class: validatedInput.class } : {}),
			...(validatedInput.cadence ? { cadence: validatedInput.cadence } : {}),
		},
		body,
	})
	const absolutePath = path.join(documentKindDirectory(validatedRepository, type), fileName)
	const relativePath = toRepositoryRelativePath(validatedRepository, absolutePath)
	const writeIndex = new EntityReferenceIndex([
		...referenceIndex.targets,
		{ id, relativePath, title, kind: type, status },
	])
	const contents = serializeDocumentFile(document, {
		referencePathForId: (referenceId) => writeIndex.pathForId(referenceId),
	})
	const parsedDocument = normalizedDocumentFile(parseDocumentFile(contents), writeIndex)
	if (occupiedIds.has(id)) {
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

export interface DocumentIdMigration {
	readonly from: string
	readonly to: string
}

export interface DocumentIdMigrationProgress {
	readonly completed: number
	readonly total: number
	readonly percent: number
	readonly phase: 'documents' | 'references'
}

export interface DocumentIdMigrationOptions {
	readonly concurrency?: number
	readonly reservedIds?: Iterable<string>
	readonly onProgress?: (progress: DocumentIdMigrationProgress) => void
}

const REFERENCE_SCAN_IGNORED_DIRECTORIES = new Set([
	'.git',
	'.next',
	'.turbo',
	'coverage',
	'dist',
	'node_modules',
])

async function repositoryTextFiles(
	root: string,
	excludedDirectories: readonly string[],
): Promise<string[]> {
	const excluded = new Set(excludedDirectories)
	const files: string[] = []
	const visit = async (directory: string): Promise<void> => {
		let entries: Dirent<string>[]
		try {
			entries = await readdir(directory, { withFileTypes: true })
		} catch {
			return
		}
		for (const entry of entries) {
			const target = path.join(directory, entry.name)
			if (entry.isDirectory()) {
				const disposableTasksetDirectory =
					directory === path.join(root, '.taskset') &&
					['generated', 'index', 'snapshots', 'cache'].includes(entry.name)
				if (
					excluded.has(target) ||
					disposableTasksetDirectory ||
					REFERENCE_SCAN_IGNORED_DIRECTORIES.has(entry.name)
				) {
					continue
				}
				await visit(target)
			} else if (entry.isFile()) {
				files.push(target)
			}
		}
	}
	await visit(root)
	return files
}

async function pacedMap<T, R>(
	items: readonly T[],
	worker: (item: T, index: number) => Promise<R>,
	concurrency: number,
	onSettled?: (completed: number) => void,
): Promise<R[]> {
	if (items.length === 0) return []
	const results: R[] = new Array(items.length)
	let completed = 0
	let firstError: Error | undefined
	await new Promise<void>((resolve) => {
		const queue = new AsyncQueuer<{ item: T; index: number }>(
			async ({ item, index }) => {
				results[index] = await worker(item, index)
			},
			{
				concurrency,
				started: false,
				throwOnError: false,
				onError: (error) => {
					firstError ??= error
				},
				onSettled: () => {
					completed += 1
					onSettled?.(completed)
					if (completed === items.length) resolve()
				},
			},
		)
		items.forEach((item, index) => {
			queue.addItem({ item, index }, 'back', false)
		})
		queue.start()
	})
	if (firstError) throw firstError
	return results
}

/**
 * Atomically migrates legacy document IDs to immutable short hex IDs, rewrites
 * relationships and repository text references, normalizes filenames to
 * `{sequence}-{slug}-{id}.md`, and repairs duplicate sequence prefixes by
 * `createdAt` within each document kind.
 */
export async function migrateDocumentIds(
	repository: Repository,
	options: DocumentIdMigrationOptions = {},
): Promise<readonly DocumentIdMigration[]> {
	const validatedRepository = parseCoreInput(RepositorySchema, repository, 'document ID migration')
	const concurrency = z
		.number()
		.int()
		.min(1)
		.max(32)
		.parse(options.concurrency ?? 8)
	const records = await listDocuments(validatedRepository)
	const occupied = new Set<string>([
		...(options.reservedIds ?? []),
		...records.map((record) => record.document.metadata.id),
	])
	const migrations = records
		.filter((record) => needsEntityIdMigration(record.document.metadata.id))
		.map((record) => {
			const to = generateEntityId(occupied)
			occupied.add(to)
			return { from: record.document.metadata.id, to }
		})
	const replacements = new Map(migrations.map((migration) => [migration.from, migration.to]))
	const replace = (id: string) => replacements.get(id) ?? id
	const sequencesByKind = new Map<DocumentKind, Map<string, number>>()
	for (const kind of Object.keys(DOCUMENT_DIRECTORY_NAMES) as DocumentKind[]) {
		const kindRecords = records.filter((record) => record.document.metadata.type === kind)
		if (kindRecords.length === 0) continue
		sequencesByKind.set(
			kind,
			planEntitySequences(kindRecords, {
				idFor: (candidate) => replace(candidate.document.metadata.id),
				createdAtFor: (candidate) => candidate.document.metadata.createdAt,
				fileNameFor: (candidate) => path.basename(candidate.relativePath),
				legacyIdFor: (candidate) => candidate.document.metadata.id,
			}),
		)
	}
	const rewrittenRecords = records.map((record) => {
		const id = replace(record.document.metadata.id)
		const sequence = sequencesByKind.get(record.document.metadata.type)?.get(id)
		if (sequence === undefined) {
			throw new DocumentRepositoryError(
				'document-invalid',
				`Unable to allocate a display sequence for document ${id}`,
				{ documentId: id, filePath: record.relativePath },
			)
		}
		const fileName = resolveEntityFileName({
			id,
			title: record.document.metadata.title,
			sequence,
		})
		const relativePath = toRepositoryRelativePath(
			validatedRepository,
			path.join(
				documentKindDirectory(validatedRepository, record.document.metadata.type),
				fileName,
			),
		)
		return {
			record,
			id,
			relativePath,
			changed:
				id !== record.document.metadata.id ||
				relativePath !== record.relativePath ||
				(record.document.metadata.dependsOn?.some((value) => replace(value) !== value) ?? false) ||
				(record.document.metadata.related?.some((value) => replace(value) !== value) ?? false) ||
				(record.document.metadata.duplicates?.some((value) => replace(value) !== value) ?? false) ||
				(record.document.metadata.parent !== undefined &&
					replace(record.document.metadata.parent) !== record.document.metadata.parent),
		}
	})
	if (!rewrittenRecords.some((item) => item.changed) && migrations.length === 0) {
		return Object.freeze([])
	}
	const documentOperationGroups = await pacedMap(
		rewrittenRecords,
		async (item) => {
			const oldPath = path.join(validatedRepository.rootDirectory, item.record.relativePath)
			const oldContents = await readDocumentContents(
				validatedRepository,
				item.record,
				item.record.document.metadata.id,
			)
			const document: DocumentFile = {
				metadata: {
					...item.record.document.metadata,
					id: item.id,
					dependsOn: item.record.document.metadata.dependsOn?.map(replace),
					related: item.record.document.metadata.related?.map(replace),
					duplicates: item.record.document.metadata.duplicates?.map(replace),
					parent: item.record.document.metadata.parent
						? replace(item.record.document.metadata.parent)
						: undefined,
				},
				body: item.record.document.body,
			}
			const newPath = path.join(validatedRepository.rootDirectory, item.relativePath)
			const contents = serializeDocumentFile(document)
			if (!item.changed) return []
			return oldPath === newPath
				? [{ targetPath: oldPath, contents, expectedContents: oldContents }]
				: [
						{ targetPath: newPath, contents, expectedContents: null },
						{ targetPath: oldPath, contents: null, expectedContents: oldContents },
					]
		},
		concurrency,
		(completed) => {
			options.onProgress?.({
				completed,
				total: rewrittenRecords.length,
				percent: Math.round((completed / rewrittenRecords.length) * 100),
				phase: 'documents',
			})
		},
	)
	const files = await repositoryTextFiles(
		validatedRepository.rootDirectory,
		Object.values(DOCUMENT_DIRECTORY_NAMES).map((name) =>
			path.join(validatedRepository.documentsDirectory, name),
		),
	)
	const referenceOperations = (
		await pacedMap(
			files,
			async (targetPath) => {
				let source: string
				try {
					source = await readFile(targetPath, 'utf8')
				} catch {
					return undefined
				}
				if (source.includes('\0')) return undefined
				let contents = source
				for (const migration of migrations) {
					contents = contents.split(migration.from).join(migration.to)
				}
				return contents === source ? undefined : { targetPath, contents, expectedContents: source }
			},
			concurrency,
			(completed) =>
				options.onProgress?.({
					completed,
					total: files.length,
					percent: Math.round((completed / files.length) * 100),
					phase: 'references',
				}),
		)
	).filter((operation): operation is NonNullable<typeof operation> => operation !== undefined)
	const operations = [...documentOperationGroups.flat(), ...referenceOperations]
	if (operations.length === 0) return Object.freeze([])
	await applyFileTransaction(operations)
	await refreshGeneratedViews(validatedRepository, undefined)
	return Object.freeze(
		migrations.map((migration): DocumentIdMigration => Object.freeze({ ...migration })),
	)
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
	const parsedInput = parseInput(UpdateDocumentInputSchema, input, 'document update')
	const validatedOptions = parseCoreInput(
		UpdateDocumentOptionsSchema,
		options,
		'document update options',
	)
	const records = await listDocuments(validatedRepository)
	const documentIndex = new EntityReferenceIndex(records.map(documentReferenceTarget))
	let validatedId: string
	try {
		validatedId = documentIndex.resolveId(id)
	} catch (error) {
		if (error instanceof EntityReferenceError)
			throw new DocumentRepositoryError(
				error.code === 'ambiguous' ? 'document-ambiguous' : 'document-not-found',
				error.message,
				{ documentId: id },
			)
		throw error
	}
	const referenceIndex = await repositoryReferenceIndex(validatedRepository, records)
	const validatedInput = resolveDocumentInputReferences(parsedInput, referenceIndex)
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
	const current = normalizedDocumentFile(parseDocumentFile(originalContents), referenceIndex)

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

	const nextBody = validatedInput.body ?? current.body
	validateDocumentBody(current.metadata.type, nextBody)

	const nextSeverity =
		validatedInput.severity === null
			? undefined
			: (validatedInput.severity ?? current.metadata.severity)
	const nextClass =
		validatedInput.class === null ? undefined : (validatedInput.class ?? current.metadata.class)
	const nextCadence =
		validatedInput.cadence === null
			? undefined
			: (validatedInput.cadence ?? current.metadata.cadence)
	const nextRelatedSkills = validatedInput.relatedSkills ?? current.metadata.relatedSkills
	const nextPacks = validatedInput.packs ?? current.metadata.packs
	const nextLabels = validatedInput.labels ?? current.metadata.labels
	const nextProjects = validatedInput.projects ?? current.metadata.projects

	validateDocumentTaxonomy(validatedRepository, {
		...(nextLabels ? { labels: nextLabels } : {}),
		...(nextProjects ? { projects: nextProjects } : {}),
		...(nextClass ? { class: nextClass } : {}),
	})

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
			...(nextSeverity !== undefined
				? { severity: nextSeverity as LessonSeverity }
				: { severity: undefined }),
			relatedSkills: nextRelatedSkills,
			packs: nextPacks,
			...(nextClass !== undefined ? { class: nextClass as ConcernClass } : { class: undefined }),
			...(nextCadence !== undefined ? { cadence: nextCadence } : { cadence: undefined }),
		},
		body: nextBody,
	}
	const contents = serializeDocumentFile(updatedDocument, {
		referencePathForId: (referenceId) => referenceIndex.pathForId(referenceId),
	})
	const parsedDocument = normalizedDocumentFile(parseDocumentFile(contents), referenceIndex)
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
	const validatedOptions = parseCoreInput(
		DeleteDocumentOptionsSchema,
		options,
		'document deletion options',
	)
	const records = await listDocuments(validatedRepository)
	const referenceIndex = await repositoryReferenceIndex(validatedRepository, records)
	let validatedId: string
	try {
		validatedId = new EntityReferenceIndex(records.map(documentReferenceTarget)).resolveId(id)
	} catch (error) {
		if (error instanceof EntityReferenceError)
			throw new DocumentRepositoryError(
				error.code === 'ambiguous' ? 'document-ambiguous' : 'document-not-found',
				error.message,
				{ documentId: id },
			)
		throw error
	}
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
			const currentDocument = normalizedDocumentFile(
				parseDocumentFile(originalContents),
				referenceIndex,
			)
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
				contents: serializeDocumentFile(repairedDocument, {
					referencePathForId: (referenceId) => referenceIndex.pathForId(referenceId),
				}),
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
