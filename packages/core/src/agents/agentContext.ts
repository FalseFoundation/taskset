import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
	DOCUMENT_KINDS,
	DOCUMENT_STATUSES,
	type DocumentKind,
	type DocumentStatus,
	type TaskPriority,
	type TaskStatus,
} from '@taskset/contracts'
import * as z from 'zod'
import { discoverRepository } from '../config/config.ts'
import { type DocumentRecord, listDocuments } from '../documents/documentRepository.ts'
import { EntityReferenceIndex } from '../ids/entityReference.ts'
import { listTasks, type TaskRecord } from '../tasks/taskRepository.ts'

const execFileAsync = promisify(execFile)
const DEFAULT_MAX_BODY_CHARS = 4_000
const DEFAULT_MAX_CHILDREN = 20
const DEFAULT_MAX_RELATED = 20
const DOCUMENT_SUMMARY_CHARS = 240

export const AgentContextLimitsSchema = z.strictObject({
	maxBodyChars: z.number().int().nonnegative().max(1_000_000).optional(),
	maxChildren: z.number().int().nonnegative().max(10_000).optional(),
	maxRelated: z.number().int().nonnegative().max(10_000).optional(),
})

export type AgentContextLimits = z.infer<typeof AgentContextLimitsSchema>

export const AgentContextInputSchema = z.strictObject({
	task: z.string().trim().min(1),
	cwd: z.string().trim().min(1).optional(),
	includeDocumentBodies: z.boolean().optional(),
	limits: AgentContextLimitsSchema.optional(),
})

export type AgentContextInput = z.infer<typeof AgentContextInputSchema>

export interface AgentContextBody {
	readonly text: string
	readonly truncated: boolean
	readonly originalChars: number
}

export interface AgentContextChecklist {
	readonly total: number
	readonly checked: number
	readonly unchecked: number
}

export interface AgentContextTask {
	readonly id: string
	readonly path: string
	readonly title: string
	readonly status: TaskStatus
	readonly priority?: TaskPriority
	readonly owner?: string
	readonly assignees: readonly string[]
	readonly reviewers: readonly string[]
	readonly body: AgentContextBody
}

export interface AgentExecutionGate {
	readonly gitIdentity?: string
	readonly result: 'allowed' | 'confirmation_required' | 'blocked'
	readonly reasons: readonly string[]
}

export interface AgentTaskSummary {
	readonly id: string
	readonly path: string
	readonly title: string
	readonly status: TaskStatus
}

export interface AgentContextWarning {
	readonly code: string
	readonly message: string
}

export interface AgentDocumentSummary {
	readonly id: string
	readonly path: string
	readonly title: string
	readonly type: DocumentKind
	readonly status: DocumentStatus
	readonly summary: string
	readonly body?: AgentContextBody
}

export interface AgentDocumentCollection {
	readonly items: readonly AgentDocumentSummary[]
	readonly total: number
	readonly truncated: boolean
}

export interface AgentContext {
	readonly formatVersion: '1'
	readonly task: AgentContextTask
	readonly checklist: AgentContextChecklist
	readonly dependencies: {
		readonly items: readonly AgentTaskSummary[]
		readonly unresolved: readonly string[]
	}
	readonly parent: AgentTaskSummary | null
	readonly children: {
		readonly items: readonly AgentTaskSummary[]
		readonly total: number
		readonly truncated: boolean
	}
	readonly program: {
		readonly childrenByStatus: Readonly<Record<TaskStatus, number>>
		readonly openChildIds: readonly string[]
		readonly closeoutReady: boolean
	}
	readonly documents: {
		readonly groups: readonly {
			readonly type: DocumentKind
			readonly status: DocumentStatus
			readonly items: readonly AgentDocumentSummary[]
		}[]
		readonly total: number
		readonly truncated: boolean
	}
	readonly attention: {
		readonly activeConcerns: AgentDocumentCollection
		readonly pendingDecisions: AgentDocumentCollection
		readonly pendingResearch: AgentDocumentCollection
	}
	readonly scopes: {
		readonly files: readonly string[]
		readonly directories: readonly string[]
		readonly projects: readonly string[]
	}
	readonly execution: AgentExecutionGate
	readonly warnings: readonly AgentContextWarning[]
}

function taskTarget(record: TaskRecord) {
	return {
		id: record.task.metadata.id,
		relativePath: record.relativePath,
		title: record.task.metadata.title,
		kind: 'task' as const,
		status: record.task.metadata.status,
	}
}

function summarizeChecklist(body: string): AgentContextChecklist {
	const items = [...body.matchAll(/^(\s*[-*]\s+)\[([ xX])\]\s+/gmu)]
	const checked = items.filter((item) => item[2]?.toLowerCase() === 'x').length
	return Object.freeze({ total: items.length, checked, unchecked: items.length - checked })
}

function boundedBody(body: string, maxChars: number): AgentContextBody {
	return Object.freeze({
		text: body.slice(0, maxChars),
		truncated: body.length > maxChars,
		originalChars: body.length,
	})
}

async function gitIdentity(rootDirectory: string): Promise<string | undefined> {
	try {
		const { stdout } = await execFileAsync('git', [
			'-C',
			rootDirectory,
			'config',
			'--get',
			'user.name',
		])
		return stdout.trim() || undefined
	} catch {
		return undefined
	}
}

function summarizeTask(record: TaskRecord): AgentTaskSummary {
	return Object.freeze({
		id: record.task.metadata.id,
		path: record.relativePath,
		title: record.task.metadata.title,
		status: record.task.metadata.status,
	})
}

function summarizeDocument(
	record: DocumentRecord,
	includeBody: boolean,
	maxBodyChars: number,
): AgentDocumentSummary {
	const summary = record.document.body
		.split(/\n\s*\n/u)
		.map((paragraph) =>
			paragraph
				.replace(/^#{1,6}\s+.*$/gmu, '')
				.replace(/\s+/gu, ' ')
				.trim(),
		)
		.find((paragraph) => paragraph.length > 0)

	return Object.freeze({
		id: record.document.metadata.id,
		path: record.relativePath,
		title: record.document.metadata.title,
		type: record.document.metadata.type,
		status: record.document.metadata.status,
		summary: (summary ?? '').slice(0, DOCUMENT_SUMMARY_CHARS),
		...(includeBody ? { body: boundedBody(record.document.body, maxBodyChars) } : {}),
	})
}

function documentCollection(
	records: readonly DocumentRecord[],
	maxRelated: number,
	includeBody: boolean,
	maxBodyChars: number,
): AgentDocumentCollection {
	const items = records
		.slice(0, maxRelated)
		.map((record) => summarizeDocument(record, includeBody, maxBodyChars))
	return Object.freeze({
		items: Object.freeze(items),
		total: records.length,
		truncated: items.length < records.length,
	})
}

function executionGate(
	record: TaskRecord,
	identity: string | undefined,
	unresolvedDependencies: readonly string[],
): AgentExecutionGate {
	const metadata = record.task.metadata
	const assignees = metadata.assignees ?? []
	const reasons: string[] = []
	let result: AgentExecutionGate['result'] = 'allowed'

	if (unresolvedDependencies.length > 0) {
		result = 'blocked'
		reasons.push('unresolved_dependencies')
	} else if (identity === undefined && (metadata.owner !== undefined || assignees.length > 0)) {
		result = 'confirmation_required'
		reasons.push('git_identity_missing')
	} else if (
		identity !== undefined &&
		!assignees.includes(identity) &&
		((assignees.length > 0 && !assignees.includes(identity)) ||
			(metadata.owner !== undefined && metadata.owner !== identity))
	) {
		result = 'confirmation_required'
		reasons.push('assigned_to_another_identity')
	}

	return Object.freeze({ ...(identity ? { gitIdentity: identity } : {}), result, reasons })
}

export async function resolveAgentContext(input: AgentContextInput): Promise<AgentContext> {
	const validated = AgentContextInputSchema.parse(input)
	const repository = await discoverRepository(validated.cwd ?? process.cwd())
	const [tasks, documents] = await Promise.all([listTasks(repository), listDocuments(repository)])
	const target = new EntityReferenceIndex(tasks.map(taskTarget)).resolve(validated.task)
	const record = tasks.find((candidate) => candidate.task.metadata.id === target.id)
	if (!record) throw new Error(`Task ${target.id} was not found`)
	const metadata = record.task.metadata
	const identity = await gitIdentity(repository.rootDirectory)
	const dependencyIds = new Set(metadata.dependsOn ?? [])
	const dependencies = tasks.filter((candidate) => dependencyIds.has(candidate.task.metadata.id))
	const unresolvedDependencies = dependencies
		.filter((candidate) => !['done', 'canceled'].includes(candidate.task.metadata.status))
		.map((candidate) => candidate.task.metadata.id)
	const parentRecord = metadata.parent
		? tasks.find((candidate) => candidate.task.metadata.id === metadata.parent)
		: undefined
	const allChildren = tasks.filter((candidate) => candidate.task.metadata.parent === metadata.id)
	const maxChildren = validated.limits?.maxChildren ?? DEFAULT_MAX_CHILDREN
	const children = allChildren.slice(0, maxChildren)
	const childrenByStatus: Record<TaskStatus, number> = {
		todo: 0,
		doing: 0,
		blocked: 0,
		done: 0,
		canceled: 0,
	}
	for (const child of allChildren) childrenByStatus[child.task.metadata.status] += 1
	const openChildIds = allChildren
		.filter((child) => !['done', 'canceled'].includes(child.task.metadata.status))
		.map((child) => child.task.metadata.id)
	const checklist = summarizeChecklist(record.task.body)
	const relatedIds = new Set(metadata.related ?? [])
	const relatedDocuments = documents
		.filter(
			(document) =>
				relatedIds.has(document.document.metadata.id) ||
				(document.document.metadata.related ?? []).includes(metadata.id),
		)
		.sort(
			(left, right) =>
				DOCUMENT_KINDS.indexOf(left.document.metadata.type) -
					DOCUMENT_KINDS.indexOf(right.document.metadata.type) ||
				DOCUMENT_STATUSES.indexOf(left.document.metadata.status) -
					DOCUMENT_STATUSES.indexOf(right.document.metadata.status) ||
				left.relativePath.localeCompare(right.relativePath),
		)
	const maxRelated = validated.limits?.maxRelated ?? DEFAULT_MAX_RELATED
	const maxBodyChars = validated.limits?.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS
	const includeDocumentBodies = validated.includeDocumentBodies ?? false
	const visibleDocuments = relatedDocuments.slice(0, maxRelated)
	const documentGroups = visibleDocuments.reduce<
		{
			readonly type: DocumentKind
			readonly status: DocumentStatus
			readonly items: AgentDocumentSummary[]
		}[]
	>((groups, document) => {
		const metadata = document.document.metadata
		const current = groups.at(-1)
		if (current?.type === metadata.type && current.status === metadata.status) {
			current.items.push(summarizeDocument(document, includeDocumentBodies, maxBodyChars))
		} else {
			groups.push({
				type: metadata.type,
				status: metadata.status,
				items: [summarizeDocument(document, includeDocumentBodies, maxBodyChars)],
			})
		}
		return groups
	}, [])
	const activeConcerns = relatedDocuments.filter(
		(document) =>
			document.document.metadata.type === 'concern' &&
			['draft', 'ready', 'active'].includes(document.document.metadata.status),
	)
	const pendingDecisions = relatedDocuments.filter(
		(document) =>
			document.document.metadata.type === 'decision' &&
			['draft', 'ready', 'active'].includes(document.document.metadata.status),
	)
	const pendingResearch = relatedDocuments.filter(
		(document) =>
			document.document.metadata.type === 'research' &&
			!['accepted', 'superseded', 'archived'].includes(document.document.metadata.status),
	)
	const activeConcernCollection = documentCollection(
		activeConcerns,
		maxRelated,
		includeDocumentBodies,
		maxBodyChars,
	)
	const pendingDecisionCollection = documentCollection(
		pendingDecisions,
		maxRelated,
		includeDocumentBodies,
		maxBodyChars,
	)
	const pendingResearchCollection = documentCollection(
		pendingResearch,
		maxRelated,
		includeDocumentBodies,
		maxBodyChars,
	)
	const warnings: AgentContextWarning[] = []
	if (children.length < allChildren.length) {
		warnings.push({
			code: 'children_truncated',
			message: `Showing ${children.length} of ${allChildren.length} child tasks`,
		})
	}
	if (visibleDocuments.length < relatedDocuments.length) {
		warnings.push({
			code: 'documents_truncated',
			message: `Showing ${visibleDocuments.length} of ${relatedDocuments.length} related documents`,
		})
	}
	if (record.task.body.length > maxBodyChars) {
		warnings.push({
			code: 'task_body_truncated',
			message: `Task body was truncated from ${record.task.body.length} to ${maxBodyChars} characters`,
		})
	}
	if (includeDocumentBodies) {
		for (const document of visibleDocuments.filter(
			(candidate) => candidate.document.body.length > maxBodyChars,
		)) {
			warnings.push({
				code: 'document_body_truncated',
				message: `Document ${document.document.metadata.id} body was truncated from ${document.document.body.length} to ${maxBodyChars} characters`,
			})
		}
	}
	for (const [code, label, collection] of [
		['active_concerns_truncated', 'active concerns', activeConcernCollection],
		['pending_decisions_truncated', 'pending decisions', pendingDecisionCollection],
		['pending_research_truncated', 'pending research', pendingResearchCollection],
	] as const) {
		if (collection.truncated) {
			warnings.push({
				code,
				message: `Showing ${collection.items.length} of ${collection.total} ${label}`,
			})
		}
	}

	return Object.freeze({
		formatVersion: '1',
		task: Object.freeze({
			id: metadata.id,
			path: record.relativePath,
			title: metadata.title,
			status: metadata.status,
			...(metadata.priority ? { priority: metadata.priority } : {}),
			...(metadata.owner ? { owner: metadata.owner } : {}),
			assignees: Object.freeze([...(metadata.assignees ?? [])]),
			reviewers: Object.freeze([...(metadata.reviewers ?? [])]),
			body: boundedBody(record.task.body, maxBodyChars),
		}),
		checklist,
		dependencies: Object.freeze({
			items: Object.freeze(dependencies.map(summarizeTask)),
			unresolved: Object.freeze(unresolvedDependencies),
		}),
		parent: parentRecord ? summarizeTask(parentRecord) : null,
		children: Object.freeze({
			items: Object.freeze(children.map(summarizeTask)),
			total: allChildren.length,
			truncated: children.length < allChildren.length,
		}),
		program: Object.freeze({
			childrenByStatus: Object.freeze(childrenByStatus),
			openChildIds: Object.freeze(openChildIds),
			closeoutReady:
				openChildIds.length === 0 &&
				checklist.unchecked === 0 &&
				activeConcerns.length === 0 &&
				pendingResearch.length === 0,
		}),
		documents: Object.freeze({
			groups: Object.freeze(
				documentGroups.map((group) =>
					Object.freeze({ ...group, items: Object.freeze(group.items) }),
				),
			),
			total: relatedDocuments.length,
			truncated: visibleDocuments.length < relatedDocuments.length,
		}),
		attention: Object.freeze({
			activeConcerns: activeConcernCollection,
			pendingDecisions: pendingDecisionCollection,
			pendingResearch: pendingResearchCollection,
		}),
		scopes: Object.freeze({
			files: Object.freeze([...(metadata.files ?? [])]),
			directories: Object.freeze([...(metadata.directories ?? [])]),
			projects: Object.freeze([...(metadata.projects ?? [])]),
		}),
		execution: executionGate(record, identity, unresolvedDependencies),
		warnings: Object.freeze(warnings),
	})
}
