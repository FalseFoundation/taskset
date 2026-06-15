import {
	TASK_PRIORITIES,
	TASK_RISKS,
	TASK_STATUSES,
	TaskIdSchema,
	type TaskPriority,
	TaskPrioritySchema,
	type TaskRisk,
	TaskRiskSchema,
	TaskStatusSchema,
	TaskTimestampSchema,
} from '@taskset/contracts'
import { parseDate } from '@taskset/utils'
import * as z from 'zod'
import type { Repository } from '../config/config.ts'
import { buildTaskGraph } from '../graph/taskGraph.ts'
import { normalizeRepositoryPath, repositoryPathsRelate } from '../projects/repositoryPath.ts'
import { listTasks, type TaskRecord } from '../tasks/taskRepository.ts'
import { parseCoreInput } from '../validation/coreValidation.ts'

export const TASK_SORT_KEYS = [
	'id',
	'title',
	'status',
	'priority',
	'owner',
	'team',
	'estimate',
	'effort',
	'risk',
	'dueDate',
	'createdAt',
	'updatedAt',
] as const
export const TASK_SORT_DIRECTIONS = ['asc', 'desc'] as const

export type TaskSortKey = (typeof TASK_SORT_KEYS)[number]
export type TaskSortDirection = (typeof TASK_SORT_DIRECTIONS)[number]

const StringListSchema = z.array(z.string().min(1))
const NonnegativeNumberSchema = z.number().finite().nonnegative()

export const TaskQuerySchema = z
	.strictObject({
		statuses: z.array(TaskStatusSchema).optional(),
		priorities: z.array(TaskPrioritySchema).optional(),
		labels: StringListSchema.optional(),
		owners: StringListSchema.optional(),
		assignees: StringListSchema.optional(),
		reviewers: StringListSchema.optional(),
		teams: StringListSchema.optional(),
		risks: z.array(TaskRiskSchema).optional(),
		projects: StringListSchema.optional(),
		dependsOn: TaskIdSchema.optional(),
		related: TaskIdSchema.optional(),
		duplicate: TaskIdSchema.optional(),
		parent: TaskIdSchema.optional(),
		files: StringListSchema.optional(),
		directories: StringListSchema.optional(),
		estimateMin: NonnegativeNumberSchema.optional(),
		estimateMax: NonnegativeNumberSchema.optional(),
		effortMin: NonnegativeNumberSchema.optional(),
		effortMax: NonnegativeNumberSchema.optional(),
		dueBefore: TaskTimestampSchema.optional(),
		dueAfter: TaskTimestampSchema.optional(),
		createdBefore: TaskTimestampSchema.optional(),
		createdAfter: TaskTimestampSchema.optional(),
		updatedBefore: TaskTimestampSchema.optional(),
		updatedAfter: TaskTimestampSchema.optional(),
		text: z.string().optional(),
		sortBy: z.enum(TASK_SORT_KEYS).optional(),
		direction: z.enum(TASK_SORT_DIRECTIONS).optional(),
		impact: z.boolean().optional(),
	})
	.superRefine((query, context) => {
		for (const [minimumKey, maximumKey, label] of [
			['estimateMin', 'estimateMax', 'estimate'],
			['effortMin', 'effortMax', 'effort'],
		] as const) {
			const minimum = query[minimumKey]
			const maximum = query[maximumKey]

			if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
				context.addIssue({
					code: 'custom',
					path: [maximumKey],
					message: `${label} maximum must be greater than or equal to its minimum`,
				})
			}
		}

		for (const [afterKey, beforeKey, label] of [
			['dueAfter', 'dueBefore', 'due date'],
			['createdAfter', 'createdBefore', 'created timestamp'],
			['updatedAfter', 'updatedBefore', 'updated timestamp'],
		] as const) {
			const after = query[afterKey] ? parseDate(query[afterKey]) : undefined
			const before = query[beforeKey] ? parseDate(query[beforeKey]) : undefined

			if (after !== undefined && before !== undefined && after > before) {
				context.addIssue({
					code: 'custom',
					path: [beforeKey],
					message: `${label} before value must be greater than or equal to its after value`,
				})
			}
		}
	})

export type TaskQuery = z.infer<typeof TaskQuerySchema>

export interface TaskQueryResult {
	readonly direct: readonly TaskRecord[]
	readonly impacted: readonly TaskRecord[]
}

function normalizeSearchText(value: string): string {
	return value.normalize('NFKC').toLocaleLowerCase('und')
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0
}

function compareOptional<T>(
	left: T | undefined,
	right: T | undefined,
	compare: (leftValue: T, rightValue: T) => number,
): number {
	if (left === right) {
		return 0
	}

	if (left === undefined) {
		return 1
	}

	if (right === undefined) {
		return -1
	}

	return compare(left, right)
}

function versionTwoMetadata(record: TaskRecord) {
	return record.task.metadata.schemaVersion === 2 ? record.task.metadata : undefined
}

function compareRecords(left: TaskRecord, right: TaskRecord, sortBy: TaskSortKey): number {
	const leftMetadata = left.task.metadata
	const rightMetadata = right.task.metadata
	const leftV2 = versionTwoMetadata(left)
	const rightV2 = versionTwoMetadata(right)
	let comparison = 0

	switch (sortBy) {
		case 'title':
			comparison = compareText(leftMetadata.title, rightMetadata.title)
			break
		case 'status':
			comparison =
				TASK_STATUSES.indexOf(leftMetadata.status) - TASK_STATUSES.indexOf(rightMetadata.status)
			break
		case 'priority':
			comparison = compareOptional<TaskPriority>(
				leftMetadata.priority,
				rightMetadata.priority,
				(leftPriority, rightPriority) =>
					TASK_PRIORITIES.indexOf(leftPriority) - TASK_PRIORITIES.indexOf(rightPriority),
			)
			break
		case 'owner':
			comparison = compareOptional(leftV2?.owner, rightV2?.owner, compareText)
			break
		case 'team':
			comparison = compareOptional(leftV2?.team, rightV2?.team, compareText)
			break
		case 'estimate':
			comparison = compareOptional(
				leftV2?.estimate,
				rightV2?.estimate,
				(leftValue, rightValue) => leftValue - rightValue,
			)
			break
		case 'effort':
			comparison = compareOptional(
				leftV2?.effort,
				rightV2?.effort,
				(leftValue, rightValue) => leftValue - rightValue,
			)
			break
		case 'risk':
			comparison = compareOptional<TaskRisk>(
				leftV2?.risk,
				rightV2?.risk,
				(leftRisk, rightRisk) => TASK_RISKS.indexOf(leftRisk) - TASK_RISKS.indexOf(rightRisk),
			)
			break
		case 'dueDate':
			comparison = compareOptional(
				leftV2?.dueDate,
				rightV2?.dueDate,
				(leftValue, rightValue) => (parseDate(leftValue) ?? 0) - (parseDate(rightValue) ?? 0),
			)
			break
		case 'createdAt':
			comparison =
				(parseDate(leftMetadata.createdAt) ?? 0) - (parseDate(rightMetadata.createdAt) ?? 0)
			break
		case 'updatedAt':
			comparison =
				(parseDate(leftMetadata.updatedAt) ?? 0) - (parseDate(rightMetadata.updatedAt) ?? 0)
			break
		default:
			comparison = compareText(leftMetadata.id, rightMetadata.id)
	}

	return comparison || compareText(leftMetadata.id, rightMetadata.id)
}

function includesAny(values: readonly string[] | undefined, filters: readonly string[]): boolean {
	return filters.some((filter) => values?.includes(filter) ?? false)
}

function matchesPathFilters(record: TaskRecord, query: TaskQuery): boolean {
	const metadata = record.task.metadata
	const directories = metadata.schemaVersion === 2 ? (metadata.directories ?? []) : []
	const allPaths = [...(metadata.files ?? []), ...directories]

	if (
		query.files &&
		!query.files.some((filter) => allPaths.some((value) => repositoryPathsRelate(value, filter)))
	) {
		return false
	}

	if (
		query.directories &&
		!query.directories.some((filter) =>
			directories.some((value) => repositoryPathsRelate(value, filter)),
		)
	) {
		return false
	}

	return true
}

function validateQuery(query: TaskQuery): TaskQuery {
	return parseCoreInput(TaskQuerySchema, query, 'task query')
}

/**
 * Applies deterministic metadata and text filters to already-loaded canonical
 * records. Repository path normalization is handled by `queryTasks`.
 */
export function queryTaskRecords(
	records: readonly TaskRecord[],
	query: TaskQuery = {},
): readonly TaskRecord[] {
	const validatedQuery = validateQuery(query)
	const searchText = validatedQuery.text
		? normalizeSearchText(validatedQuery.text.trim())
		: undefined
	const sortBy = validatedQuery.sortBy ?? 'id'
	const direction = validatedQuery.direction ?? 'asc'
	const dueBefore = validatedQuery.dueBefore ? parseDate(validatedQuery.dueBefore) : undefined
	const dueAfter = validatedQuery.dueAfter ? parseDate(validatedQuery.dueAfter) : undefined
	const createdBefore = validatedQuery.createdBefore
		? parseDate(validatedQuery.createdBefore)
		: undefined
	const createdAfter = validatedQuery.createdAfter
		? parseDate(validatedQuery.createdAfter)
		: undefined
	const updatedBefore = validatedQuery.updatedBefore
		? parseDate(validatedQuery.updatedBefore)
		: undefined
	const updatedAfter = validatedQuery.updatedAfter
		? parseDate(validatedQuery.updatedAfter)
		: undefined
	const filtered = records.filter((record) => {
		const metadata = record.task.metadata
		const v2 = versionTwoMetadata(record)

		if (validatedQuery.statuses && !validatedQuery.statuses.includes(metadata.status)) {
			return false
		}

		if (
			validatedQuery.priorities &&
			(!metadata.priority || !validatedQuery.priorities.includes(metadata.priority))
		) {
			return false
		}

		if (
			validatedQuery.labels &&
			!validatedQuery.labels.every((label) => metadata.labels?.includes(label) ?? false)
		) {
			return false
		}

		if (validatedQuery.owners && (!v2?.owner || !validatedQuery.owners.includes(v2.owner))) {
			return false
		}

		if (validatedQuery.assignees && !includesAny(v2?.assignees, validatedQuery.assignees)) {
			return false
		}

		if (validatedQuery.reviewers && !includesAny(v2?.reviewers, validatedQuery.reviewers)) {
			return false
		}

		if (validatedQuery.teams && (!v2?.team || !validatedQuery.teams.includes(v2.team))) {
			return false
		}

		if (validatedQuery.risks && (!v2?.risk || !validatedQuery.risks.includes(v2.risk))) {
			return false
		}

		if (validatedQuery.projects && !includesAny(v2?.projects, validatedQuery.projects)) {
			return false
		}

		if (validatedQuery.dependsOn && !metadata.dependsOn?.includes(validatedQuery.dependsOn)) {
			return false
		}

		if (validatedQuery.related && !v2?.related?.includes(validatedQuery.related)) {
			return false
		}

		if (validatedQuery.duplicate && !v2?.duplicates?.includes(validatedQuery.duplicate)) {
			return false
		}

		if (validatedQuery.parent && v2?.parent !== validatedQuery.parent) {
			return false
		}

		if (!matchesPathFilters(record, validatedQuery)) {
			return false
		}

		const dueTimestamp = v2?.dueDate ? parseDate(v2.dueDate) : undefined
		const createdTimestamp = parseDate(metadata.createdAt)
		const updatedTimestamp = parseDate(metadata.updatedAt)

		if (
			validatedQuery.estimateMin !== undefined &&
			(v2?.estimate === undefined || v2.estimate < validatedQuery.estimateMin)
		) {
			return false
		}

		if (
			validatedQuery.estimateMax !== undefined &&
			(v2?.estimate === undefined || v2.estimate > validatedQuery.estimateMax)
		) {
			return false
		}

		if (
			validatedQuery.effortMin !== undefined &&
			(v2?.effort === undefined || v2.effort < validatedQuery.effortMin)
		) {
			return false
		}

		if (
			validatedQuery.effortMax !== undefined &&
			(v2?.effort === undefined || v2.effort > validatedQuery.effortMax)
		) {
			return false
		}

		if (dueBefore !== undefined && (dueTimestamp === undefined || dueTimestamp > dueBefore)) {
			return false
		}

		if (dueAfter !== undefined && (dueTimestamp === undefined || dueTimestamp < dueAfter)) {
			return false
		}

		if (
			createdBefore !== undefined &&
			(createdTimestamp === undefined || createdTimestamp > createdBefore)
		) {
			return false
		}

		if (
			createdAfter !== undefined &&
			(createdTimestamp === undefined || createdTimestamp < createdAfter)
		) {
			return false
		}

		if (
			updatedBefore !== undefined &&
			(updatedTimestamp === undefined || updatedTimestamp > updatedBefore)
		) {
			return false
		}

		if (
			updatedAfter !== undefined &&
			(updatedTimestamp === undefined || updatedTimestamp < updatedAfter)
		) {
			return false
		}

		if (searchText) {
			const haystack = normalizeSearchText(`${metadata.title}\n${record.task.body}`)

			if (!haystack.includes(searchText)) {
				return false
			}
		}

		return true
	})

	return Object.freeze(
		filtered.sort((left, right) => {
			const comparison = compareRecords(left, right, sortBy)
			return direction === 'desc' ? -comparison : comparison
		}),
	)
}

/**
 * Runs a canonical repository query and optionally expands direct matches to
 * tasks that transitively depend on them.
 */
export async function queryTasks(
	repository: Repository,
	query: TaskQuery = {},
): Promise<TaskQueryResult> {
	const validatedQuery = validateQuery(query)
	const normalizedQuery: TaskQuery = {
		...validatedQuery,
		...(validatedQuery.files
			? {
					files: validatedQuery.files.map((value) => normalizeRepositoryPath(repository, value)),
				}
			: {}),
		...(validatedQuery.directories
			? {
					directories: validatedQuery.directories.map((value) =>
						normalizeRepositoryPath(repository, value),
					),
				}
			: {}),
	}
	const records = await listTasks(repository)
	const direct = queryTaskRecords(records, normalizedQuery)
	const directIds = new Set(direct.map((record) => record.task.metadata.id))
	const impactedIds = new Set<string>()

	if (validatedQuery.impact) {
		const graph = buildTaskGraph(records)

		for (const taskId of directIds) {
			for (const impactedId of graph.traverse(taskId, 'blocks')) {
				if (!directIds.has(impactedId)) {
					impactedIds.add(impactedId)
				}
			}
		}
	}

	const impacted = queryTaskRecords(
		records.filter((record) => impactedIds.has(record.task.metadata.id)),
		{ sortBy: normalizedQuery.sortBy, direction: normalizedQuery.direction },
	)

	return Object.freeze({ direct, impacted })
}
