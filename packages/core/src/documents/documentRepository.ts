import type { Dirent } from 'node:fs'
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { AsyncQueuer } from '@tanstack/pacer'
import {
	type DocumentFile,
	DocumentFileSchema,
	type DocumentKind,
	DocumentKindSchema,
	type DocumentStatus,
	DocumentStatusSchema,
	DocumentTitleSchema,
} from '@taskset/contracts'
import { formatDate, parseFrontmatter, serializeFrontmatter } from '@taskset/utils'
import * as z from 'zod'
import { DOCUMENT_DIRECTORY_NAMES, type Repository, RepositorySchema } from '../config/config.ts'
import { atomicWriteFileExclusive } from '../repository/atomicWrite.ts'
import { applyFileTransaction } from '../repository/fileTransaction.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

export interface DocumentRecord {
	readonly relativePath: string
	readonly document: DocumentFile
}

export interface CreateDocumentInput {
	readonly type: DocumentKind
	readonly title: string
	readonly status?: DocumentStatus
	readonly labels?: readonly string[]
	readonly related?: readonly string[]
	readonly body?: string
}

export interface ImportDocumentOptions {
	readonly type?: DocumentKind
	readonly title?: string
	readonly move?: boolean
}

export interface UpdateDocumentInput {
	readonly title?: string
	readonly status?: DocumentStatus
	readonly labels?: readonly string[]
	readonly related?: readonly string[]
	readonly body?: string
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

function directoryFor(repository: Repository, type: DocumentKind): string {
	return path.join(repository.documentsDirectory, DOCUMENT_DIRECTORY_NAMES[type])
}

function relativePath(repository: Repository, absolutePath: string): string {
	return path.relative(repository.rootDirectory, absolutePath).split(path.sep).join('/')
}

function defaultStatus(type: DocumentKind): DocumentStatus {
	return type === 'decision' ? 'accepted' : type === 'runbook' ? 'active' : 'draft'
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
	return serializeFrontmatter(
		{
			id: metadata.id,
			type: metadata.type,
			title: metadata.title,
			status: metadata.status,
			createdAt: metadata.createdAt,
			updatedAt: metadata.updatedAt,
			...(metadata.labels ? { labels: metadata.labels } : {}),
			...(metadata.related ? { related: metadata.related } : {}),
		},
		parsed.body,
	)
}

async function nextId(repository: Repository, type: DocumentKind, title: string): Promise<string> {
	let entries: Dirent<string>[] = []
	try {
		entries = await readdir(directoryFor(repository, type), { withFileTypes: true })
	} catch {}
	const maximum = entries.reduce((value, entry) => {
		const match = /^(\d{7})-/u.exec(entry.name)
		return Math.max(value, match ? Number(match[1]) : 0)
	}, 0)
	return `${String(maximum + 1).padStart(7, '0')}-${slugifyDocumentTitle(title)}`
}

export async function createDocument(
	repository: Repository,
	input: CreateDocumentInput,
): Promise<DocumentRecord> {
	const validatedRepository = parseCoreInput(RepositorySchema, repository, 'document repository')
	const type = DocumentKindSchema.parse(input.type)
	const title = DocumentTitleSchema.parse(input.title)
	const status = input.status ? DocumentStatusSchema.parse(input.status) : defaultStatus(type)
	const id = await nextId(validatedRepository, type, title)
	const timestamp = formatDate(new Date())
	const document = DocumentFileSchema.parse({
		metadata: {
			id,
			type,
			title,
			status,
			createdAt: timestamp,
			updatedAt: timestamp,
			...(input.labels?.length ? { labels: [...input.labels] } : {}),
			...(input.related?.length ? { related: [...input.related] } : {}),
		},
		body: input.body ?? documentTemplate(type, title),
	})
	const absolutePath = path.join(directoryFor(validatedRepository, type), `${id}.md`)
	await mkdir(path.dirname(absolutePath), { recursive: true })
	await atomicWriteFileExclusive(absolutePath, serializeDocumentFile(document))
	return Object.freeze({ relativePath: relativePath(validatedRepository, absolutePath), document })
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
	for (const kind of kinds) {
		const directory = directoryFor(validatedRepository, kind)
		let entries: Dirent<string>[] = []
		try {
			entries = await readdir(directory, { withFileTypes: true })
		} catch {}
		for (const entry of entries
			.filter((item) => item.isFile() && item.name.endsWith('.md'))
			.sort((a, b) => a.name.localeCompare(b.name))) {
			const absolutePath = path.join(directory, entry.name)
			const document = parseDocumentFile(await readFile(absolutePath, 'utf8'))
			records.push(
				Object.freeze({ relativePath: relativePath(validatedRepository, absolutePath), document }),
			)
		}
	}
	return Object.freeze(records)
}

export async function readDocument(
	repository: Repository,
	id: string,
	type?: DocumentKind,
): Promise<DocumentRecord> {
	const matches = (await listDocuments(repository, type)).filter(
		(item) => item.document.metadata.id === id,
	)
	if (matches.length === 0) throw new Error(`Document ${id} was not found`)
	if (matches.length > 1) {
		throw new Error(`Document ${id} is ambiguous; specify its document type`)
	}
	return matches[0] as DocumentRecord
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

export async function updateDocument(
	repository: Repository,
	id: string,
	input: UpdateDocumentInput,
	type?: DocumentKind,
): Promise<DocumentRecord> {
	const validatedRepository = parseCoreInput(
		RepositorySchema,
		repository,
		'document update repository',
	)
	const existing = await readDocument(validatedRepository, z.string().min(1).parse(id), type)
	const absolutePath = path.join(validatedRepository.rootDirectory, existing.relativePath)
	const original = await readFile(absolutePath, 'utf8')
	const timestamp = formatDate(new Date())
	const document = DocumentFileSchema.parse({
		metadata: {
			...existing.document.metadata,
			...(input.title !== undefined ? { title: DocumentTitleSchema.parse(input.title) } : {}),
			...(input.status !== undefined ? { status: DocumentStatusSchema.parse(input.status) } : {}),
			...(input.labels !== undefined ? { labels: [...input.labels] } : {}),
			...(input.related !== undefined ? { related: [...input.related] } : {}),
			updatedAt: timestamp,
		},
		body: input.body ?? existing.document.body,
	})
	await applyFileTransaction([
		{
			targetPath: absolutePath,
			contents: serializeDocumentFile(document),
			expectedContents: original,
		},
	])
	return Object.freeze({ relativePath: existing.relativePath, document })
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
		} catch {}
		await applyFileTransaction([{ targetPath: absolutePath, contents, expectedContents }])
	}
	return Object.freeze({ relativePath: relativePath(validatedRepository, absolutePath) })
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
