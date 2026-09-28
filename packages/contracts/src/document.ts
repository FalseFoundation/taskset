import { parseDate } from '@taskset/utils'
import * as z from 'zod'

export const DOCUMENT_KINDS = ['story', 'flow', 'decision', 'research', 'runbook'] as const
export const DOCUMENT_STATUSES = [
	'draft',
	'ready',
	'active',
	'accepted',
	'superseded',
	'archived',
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

export interface DocumentMetadata {
	readonly id: string
	readonly type: DocumentKind
	readonly title: string
	readonly status: DocumentStatus
	readonly createdAt: string
	readonly updatedAt: string
	readonly labels?: readonly string[]
	readonly related?: readonly string[]
}

export interface DocumentFile {
	readonly metadata: DocumentMetadata
	readonly body: string
}

const TrimmedValueSchema = z
	.string()
	.min(1)
	.refine((value) => value === value.trim(), 'Value must not have surrounding whitespace')

export const DocumentIdSchema = z
	.string()
	.regex(/^\d{7}-[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'Expected 0000001-short-document-title')
export const DocumentKindSchema = z.enum(DOCUMENT_KINDS)
export const DocumentStatusSchema = z.enum(DOCUMENT_STATUSES)
export const DocumentTitleSchema = TrimmedValueSchema
export const DocumentTimestampSchema = z
	.string()
	.refine((value) => parseDate(value) !== undefined, 'Expected a valid UTC timestamp')

export const DocumentMetadataSchema = z.strictObject({
	id: DocumentIdSchema,
	type: DocumentKindSchema,
	title: DocumentTitleSchema,
	status: DocumentStatusSchema,
	createdAt: DocumentTimestampSchema,
	updatedAt: DocumentTimestampSchema,
	labels: z.array(TrimmedValueSchema).optional(),
	related: z.array(TrimmedValueSchema).optional(),
}) satisfies z.ZodType<DocumentMetadata>

export const DocumentFileSchema = z.strictObject({
	metadata: DocumentMetadataSchema,
	body: z.string(),
}) satisfies z.ZodType<DocumentFile>
