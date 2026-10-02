import { type DocumentFile, DocumentFileSchema } from '@taskset/contracts'
import * as z from 'zod'
import { parseCoreInput } from '../validation/coreValidation.ts'

export interface DocumentGraphRecord {
	readonly relativePath: string
	readonly document: DocumentFile
}

export const DocumentRecordSchema = z.strictObject({
	relativePath: z.string().min(1),
	document: DocumentFileSchema,
}) satisfies z.ZodType<DocumentGraphRecord>

export const DocumentRecordsSchema = z.array(DocumentRecordSchema)
const DocumentGraphDirectionSchema = z.enum(['dependencies', 'blocks', 'children'])

export type DocumentGraphDiagnosticCode =
	| 'duplicate-id'
	| 'missing-dependency'
	| 'missing-reference'
	| 'self-dependency'
	| 'self-reference'
	| 'dependency-cycle'
	| 'parent-cycle'

export interface DocumentGraphDiagnostic {
	readonly code: DocumentGraphDiagnosticCode
	readonly field?: 'dependsOn' | 'related' | 'duplicates' | 'parent'
	readonly message: string
	readonly path?: string
	readonly documentId: string
	readonly relatedDocumentId?: string
	readonly cycle?: readonly string[]
}

export interface DerivedDocumentRelationships {
	readonly blockedBy: readonly string[]
	readonly blocks: readonly string[]
	readonly children: readonly string[]
	readonly subtasks: readonly string[]
}

export class DocumentGraphError extends Error {
	readonly diagnostics: readonly DocumentGraphDiagnostic[]

	constructor(diagnostics: readonly DocumentGraphDiagnostic[]) {
		super(diagnostics.map((diagnostic) => diagnostic.message).join('\n'))
		this.name = 'DocumentGraphError'
		this.diagnostics = Object.freeze([...diagnostics])
	}
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0
}

function canonicalCycle(cycle: readonly string[]): readonly string[] {
	const nodes = cycle.slice(0, -1)
	const first = [...nodes].sort(compareText)[0]
	const offset = first ? nodes.indexOf(first) : 0
	const rotated = [...nodes.slice(offset), ...nodes.slice(0, offset)]
	return Object.freeze([...rotated, rotated[0] ?? ''])
}

function inspectCycles(
	recordsById: ReadonlyMap<string, DocumentGraphRecord>,
	duplicateIds: ReadonlySet<string>,
	edgesFor: (record: DocumentGraphRecord) => readonly string[],
	options: {
		readonly code: 'dependency-cycle' | 'parent-cycle'
		readonly field: 'dependsOn' | 'parent'
		readonly label: string
	},
): readonly DocumentGraphDiagnostic[] {
	const diagnostics: DocumentGraphDiagnostic[] = []
	const state = new Map<string, 'visiting' | 'visited'>()
	const stack: string[] = []
	const cycleKeys = new Set<string>()

	function visit(documentId: string): void {
		if (duplicateIds.has(documentId) || state.get(documentId) === 'visited') {
			return
		}

		if (state.get(documentId) === 'visiting') {
			const cycleStart = stack.indexOf(documentId)
			const cycle = canonicalCycle([...stack.slice(cycleStart), documentId])
			const key = cycle.join('>')

			if (!cycleKeys.has(key)) {
				cycleKeys.add(key)
				diagnostics.push({
					code: options.code,
					field: options.field,
					documentId: cycle[0] ?? documentId,
					cycle,
					path: recordsById.get(cycle[0] ?? documentId)?.relativePath,
					message: `Document ${options.label} cycle detected: ${cycle.join(' -> ')}`,
				})
			}

			return
		}

		const record = recordsById.get(documentId)

		if (!record) {
			return
		}

		state.set(documentId, 'visiting')
		stack.push(documentId)

		for (const relatedDocumentId of [...edgesFor(record)].sort(compareText)) {
			if (recordsById.has(relatedDocumentId) && relatedDocumentId !== documentId) {
				visit(relatedDocumentId)
			}
		}

		stack.pop()
		state.set(documentId, 'visited')
	}

	for (const documentId of [...recordsById.keys()].sort(compareText)) {
		visit(documentId)
	}

	return diagnostics
}

export function inspectDocumentGraph(
	records: readonly DocumentGraphRecord[],
): readonly DocumentGraphDiagnostic[] {
	const validatedRecords = parseCoreInput(
		DocumentRecordsSchema,
		records,
		'document graph inspection',
	)
	const orderedRecords = [...validatedRecords].sort(
		(left, right) =>
			compareText(left.document.metadata.id, right.document.metadata.id) ||
			compareText(left.relativePath, right.relativePath),
	)
	const recordsById = new Map<string, DocumentGraphRecord>()
	const duplicateIds = new Set<string>()
	const diagnostics: DocumentGraphDiagnostic[] = []

	for (const record of orderedRecords) {
		const documentId = record.document.metadata.id
		const existing = recordsById.get(documentId)

		if (existing) {
			duplicateIds.add(documentId)
			diagnostics.push({
				code: 'duplicate-id',
				documentId,
				path: record.relativePath,
				message: `Duplicate document ID ${documentId} exists in ${existing.relativePath} and ${record.relativePath}`,
			})
		} else {
			recordsById.set(documentId, record)
		}
	}

	for (const record of orderedRecords) {
		const { metadata } = record.document
		const documentId = metadata.id
		const relationships = [
			{ field: 'dependsOn' as const, values: metadata.dependsOn ?? [], requireTarget: true },
			{ field: 'related' as const, values: metadata.related ?? [], requireTarget: false },
			{ field: 'duplicates' as const, values: metadata.duplicates ?? [], requireTarget: false },
			{
				field: 'parent' as const,
				values: metadata.parent !== undefined ? [metadata.parent] : [],
				requireTarget: true,
			},
		]

		for (const relationship of relationships) {
			for (const relatedDocumentId of [...relationship.values].sort(compareText)) {
				if (relatedDocumentId === documentId) {
					diagnostics.push({
						code: relationship.field === 'dependsOn' ? 'self-dependency' : 'self-reference',
						field: relationship.field,
						documentId,
						relatedDocumentId,
						path: record.relativePath,
						message: `Document ${documentId} cannot reference itself through ${relationship.field}`,
					})
				} else if (relationship.requireTarget && !recordsById.has(relatedDocumentId)) {
					diagnostics.push({
						code: relationship.field === 'dependsOn' ? 'missing-dependency' : 'missing-reference',
						field: relationship.field,
						documentId,
						relatedDocumentId,
						path: record.relativePath,
						message: `Document ${documentId} references missing document ${relatedDocumentId} through ${relationship.field}`,
					})
				}
			}
		}
	}

	diagnostics.push(
		...inspectCycles(
			recordsById,
			duplicateIds,
			(record) => record.document.metadata.dependsOn ?? [],
			{ code: 'dependency-cycle', field: 'dependsOn', label: 'dependency' },
		),
		...inspectCycles(
			recordsById,
			duplicateIds,
			(record) => {
				const { metadata } = record.document
				return metadata.parent ? [metadata.parent] : []
			},
			{ code: 'parent-cycle', field: 'parent', label: 'parent' },
		),
	)

	return Object.freeze(
		diagnostics.sort(
			(left, right) =>
				compareText(left.documentId, right.documentId) ||
				compareText(left.code, right.code) ||
				compareText(left.field ?? '', right.field ?? '') ||
				compareText(left.relatedDocumentId ?? '', right.relatedDocumentId ?? ''),
		),
	)
}

function freezeMapValues(source: Map<string, string[]>): ReadonlyMap<string, readonly string[]> {
	return new Map(
		[...source.entries()].map(([documentId, values]) => [
			documentId,
			Object.freeze([...values].sort(compareText)),
		]),
	)
}

export class DocumentGraph {
	readonly records: ReadonlyMap<string, DocumentGraphRecord>
	readonly dependencies: ReadonlyMap<string, readonly string[]>
	readonly blocks: ReadonlyMap<string, readonly string[]>
	readonly parents: ReadonlyMap<string, readonly string[]>
	readonly children: ReadonlyMap<string, readonly string[]>

	constructor(records: readonly DocumentGraphRecord[]) {
		const validatedRecords = parseCoreInput(
			DocumentRecordsSchema,
			records,
			'document graph construction',
		)
		const diagnostics = inspectDocumentGraph(validatedRecords)

		if (diagnostics.length > 0) {
			throw new DocumentGraphError(diagnostics)
		}

		const recordsById = new Map<string, DocumentGraphRecord>()
		const dependencies = new Map<string, string[]>()
		const blocks = new Map<string, string[]>()
		const parents = new Map<string, string[]>()
		const children = new Map<string, string[]>()

		for (const record of [...validatedRecords].sort((left, right) =>
			compareText(left.document.metadata.id, right.document.metadata.id),
		)) {
			const { metadata } = record.document
			const documentId = metadata.id
			const parent = metadata.parent ? [metadata.parent] : []
			recordsById.set(documentId, record)
			dependencies.set(documentId, [...(metadata.dependsOn ?? [])])
			blocks.set(documentId, [])
			parents.set(documentId, parent)
			children.set(documentId, [])
		}

		for (const [documentId, documentDependencies] of dependencies) {
			for (const dependencyId of documentDependencies) {
				blocks.get(dependencyId)?.push(documentId)
			}
		}

		for (const [documentId, documentParents] of parents) {
			for (const parentId of documentParents) {
				children.get(parentId)?.push(documentId)
			}
		}

		this.records = recordsById
		this.dependencies = freezeMapValues(dependencies)
		this.blocks = freezeMapValues(blocks)
		this.parents = freezeMapValues(parents)
		this.children = freezeMapValues(children)
	}

	traverse(
		documentId: string,
		direction: 'dependencies' | 'blocks' | 'children',
	): readonly string[] {
		const validatedDocumentId = parseCoreInput(
			z.string().min(1),
			documentId,
			'document graph document ID',
		)
		const validatedDirection = parseCoreInput(
			DocumentGraphDirectionSchema,
			direction,
			'document graph direction',
		)

		if (!this.records.has(validatedDocumentId)) {
			return Object.freeze([])
		}

		const relationships =
			validatedDirection === 'dependencies'
				? this.dependencies
				: validatedDirection === 'blocks'
					? this.blocks
					: this.children
		const visited = new Set<string>()
		const pending = [...(relationships.get(validatedDocumentId) ?? [])]

		while (pending.length > 0) {
			pending.sort(compareText)
			const current = pending.shift()

			if (!current || visited.has(current)) {
				continue
			}

			visited.add(current)
			pending.push(...(relationships.get(current) ?? []))
		}

		return Object.freeze([...visited].sort(compareText))
	}

	derive(documentId: string): DerivedDocumentRelationships {
		const validatedDocumentId = parseCoreInput(
			z.string().min(1),
			documentId,
			'document graph document ID',
		)

		return Object.freeze({
			blockedBy: Object.freeze([...(this.dependencies.get(validatedDocumentId) ?? [])]),
			blocks: Object.freeze([...(this.blocks.get(validatedDocumentId) ?? [])]),
			children: Object.freeze([...(this.children.get(validatedDocumentId) ?? [])]),
			subtasks: this.traverse(validatedDocumentId, 'children'),
		})
	}
}

export function buildDocumentGraph(records: readonly DocumentGraphRecord[]): DocumentGraph {
	return new DocumentGraph(records)
}
