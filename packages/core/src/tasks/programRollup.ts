import { TaskIdSchema } from '@taskset/contracts'
import type { Repository } from '../config/config.ts'
import { RepositorySchema } from '../config/config.ts'
import { type DocumentRecord, listDocuments } from '../documents/documentRepository.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'
import { listTasks, type TaskRecord } from './taskRepository.ts'

const OPEN_CONCERN_STATUSES = new Set(['draft', 'ready', 'active'])
const OPEN_TASK_STATUSES = new Set(['todo', 'doing', 'blocked'])

export interface ProgramChecklistSummary {
	readonly total: number
	readonly checked: number
	readonly unchecked: number
}

export interface ProgramStatusCounts {
	readonly todo: number
	readonly doing: number
	readonly blocked: number
	readonly done: number
	readonly canceled: number
}

export interface ProgramRollup {
	readonly parentId: string
	readonly title: string
	readonly status: string
	readonly children: {
		readonly total: number
		readonly byStatus: ProgramStatusCounts
		readonly openIds: readonly string[]
	}
	readonly blockedDependencies: readonly {
		readonly taskId: string
		readonly dependsOn: readonly string[]
	}[]
	readonly relatedOpenConcerns: readonly {
		readonly id: string
		readonly title: string
		readonly status: string
		readonly class?: string
	}[]
	readonly relatedResearchNotAccepted: readonly {
		readonly id: string
		readonly title: string
		readonly status: string
	}[]
	readonly checklist: ProgramChecklistSummary
	readonly closeoutReady: boolean
}

function checklistSummary(body: string): ProgramChecklistSummary {
	const items = [...body.matchAll(/^(\s*[-*]\s+)\[([ xX])\]\s+/gmu)]
	let checked = 0
	let unchecked = 0
	for (const item of items) {
		if (item[2]?.toLowerCase() === 'x') {
			checked += 1
		} else {
			unchecked += 1
		}
	}
	return Object.freeze({
		total: checked + unchecked,
		checked,
		unchecked,
	})
}

function relatedDocuments(
	task: TaskRecord,
	documents: readonly DocumentRecord[],
): readonly DocumentRecord[] {
	const related = new Set(task.task.metadata.related ?? [])
	const taskId = task.task.metadata.id
	return documents.filter((document) => {
		const metadata = document.document.metadata
		return related.has(metadata.id) || (metadata.related?.includes(taskId) ?? false)
	})
}

/**
 * Summarizes a parent task as a program rollup: child status counts, blocked
 * dependencies, related open concerns, research not yet accepted, and checklist
 * completion.
 */
export async function getProgramRollup(
	repository: Repository,
	parentId: string,
): Promise<ProgramRollup> {
	const validatedRepository = parseCoreInput(RepositorySchema, repository, 'program rollup')
	const validatedParentId = parseCoreInput(TaskIdSchema, parentId, 'program parent ID')
	const tasks = await listTasks(validatedRepository)
	const parent = tasks.find((record) => record.task.metadata.id === validatedParentId)

	if (!parent) {
		throw new Error(`Task ${validatedParentId} was not found`)
	}

	const children = tasks.filter((record) => record.task.metadata.parent === validatedParentId)
	const byStatus = {
		todo: 0,
		doing: 0,
		blocked: 0,
		done: 0,
		canceled: 0,
	}
	const openIds: string[] = []
	for (const child of children) {
		const status = child.task.metadata.status
		byStatus[status] += 1
		if (OPEN_TASK_STATUSES.has(status)) {
			openIds.push(child.task.metadata.id)
		}
	}

	const blockedDependencies = children
		.filter((child) => child.task.metadata.status === 'blocked')
		.map((child) =>
			Object.freeze({
				taskId: child.task.metadata.id,
				dependsOn: Object.freeze(
					(child.task.metadata.dependsOn ?? []).filter((dependencyId) => {
						const dependency = tasks.find((record) => record.task.metadata.id === dependencyId)
						return dependency ? OPEN_TASK_STATUSES.has(dependency.task.metadata.status) : true
					}),
				),
			}),
		)

	const documents = await listDocuments(validatedRepository)
	const relatedById = new Map<string, DocumentRecord>()
	for (const document of relatedDocuments(parent, documents)) {
		relatedById.set(document.document.metadata.id, document)
	}
	for (const child of children) {
		for (const document of relatedDocuments(child, documents)) {
			relatedById.set(document.document.metadata.id, document)
		}
	}

	const relatedOpenConcerns = [...relatedById.values()]
		.filter(
			(document) =>
				document.document.metadata.type === 'concern' &&
				OPEN_CONCERN_STATUSES.has(document.document.metadata.status),
		)
		.map((document) =>
			Object.freeze({
				id: document.document.metadata.id,
				title: document.document.metadata.title,
				status: document.document.metadata.status,
				...(document.document.metadata.class ? { class: document.document.metadata.class } : {}),
			}),
		)

	const relatedResearchNotAccepted = [...relatedById.values()]
		.filter(
			(document) =>
				document.document.metadata.type === 'research' &&
				document.document.metadata.status !== 'accepted' &&
				document.document.metadata.status !== 'archived' &&
				document.document.metadata.status !== 'superseded',
		)
		.map((document) =>
			Object.freeze({
				id: document.document.metadata.id,
				title: document.document.metadata.title,
				status: document.document.metadata.status,
			}),
		)

	const checklist = checklistSummary(parent.task.body)
	const closeoutReady =
		openIds.length === 0 &&
		checklist.unchecked === 0 &&
		relatedOpenConcerns.length === 0 &&
		relatedResearchNotAccepted.length === 0

	return Object.freeze({
		parentId: validatedParentId,
		title: parent.task.metadata.title,
		status: parent.task.metadata.status,
		children: Object.freeze({
			total: children.length,
			byStatus: Object.freeze(byStatus),
			openIds: Object.freeze(openIds),
		}),
		blockedDependencies: Object.freeze(blockedDependencies),
		relatedOpenConcerns: Object.freeze(relatedOpenConcerns),
		relatedResearchNotAccepted: Object.freeze(relatedResearchNotAccepted),
		checklist,
		closeoutReady,
	})
}
