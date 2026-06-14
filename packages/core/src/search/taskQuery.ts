import {
	parseTaskTimestamp,
	TASK_PRIORITIES,
	TASK_STATUSES,
	type TaskPriority,
	type TaskStatus,
} from '@taskset/contracts'
import type { Repository } from '../config/config.ts'
import { listTasks, type TaskRecord } from '../tasks/taskRepository.ts'

export type TaskSortKey = 'id' | 'title' | 'status' | 'priority' | 'createdAt' | 'updatedAt'
export type TaskSortDirection = 'asc' | 'desc'

export interface TaskQuery {
	readonly statuses?: readonly TaskStatus[]
	readonly priorities?: readonly TaskPriority[]
	readonly labels?: readonly string[]
	readonly dependsOn?: string
	readonly file?: string
	readonly text?: string
	readonly sortBy?: TaskSortKey
	readonly direction?: TaskSortDirection
}

function normalizeSearchText(value: string): string {
	return value.normalize('NFKC').toLocaleLowerCase('und')
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0
}

function compareOptional(
	left: string | undefined,
	right: string | undefined,
	compare: (leftValue: string, rightValue: string) => number = compareText,
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

function compareRecords(left: TaskRecord, right: TaskRecord, sortBy: TaskSortKey): number {
	const leftMetadata = left.task.metadata
	const rightMetadata = right.task.metadata
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
			comparison = compareOptional(
				leftMetadata.priority,
				rightMetadata.priority,
				(leftPriority, rightPriority) =>
					TASK_PRIORITIES.indexOf(leftPriority as TaskPriority) -
					TASK_PRIORITIES.indexOf(rightPriority as TaskPriority),
			)
			break
		case 'createdAt': {
			const leftTimestamp = parseTaskTimestamp(leftMetadata.createdAt) ?? 0
			const rightTimestamp = parseTaskTimestamp(rightMetadata.createdAt) ?? 0
			comparison = leftTimestamp - rightTimestamp
			break
		}
		case 'updatedAt': {
			const leftTimestamp = parseTaskTimestamp(leftMetadata.updatedAt) ?? 0
			const rightTimestamp = parseTaskTimestamp(rightMetadata.updatedAt) ?? 0
			comparison = leftTimestamp - rightTimestamp
			break
		}
		default:
			comparison = compareText(leftMetadata.id, rightMetadata.id)
	}

	return comparison || compareText(leftMetadata.id, rightMetadata.id)
}

export function queryTaskRecords(
	records: readonly TaskRecord[],
	query: TaskQuery = {},
): readonly TaskRecord[] {
	const searchText = query.text ? normalizeSearchText(query.text.trim()) : undefined
	const sortBy = query.sortBy ?? 'id'
	const direction = query.direction ?? 'asc'
	const filtered = records.filter((record) => {
		const metadata = record.task.metadata

		if (query.statuses && !query.statuses.includes(metadata.status)) {
			return false
		}

		if (query.priorities && (!metadata.priority || !query.priorities.includes(metadata.priority))) {
			return false
		}

		if (query.labels && !query.labels.every((label) => metadata.labels?.includes(label) ?? false)) {
			return false
		}

		if (query.dependsOn && !metadata.dependsOn?.includes(query.dependsOn)) {
			return false
		}

		if (query.file && !metadata.files?.includes(query.file)) {
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

export async function queryTasks(
	repository: Repository,
	query: TaskQuery = {},
): Promise<readonly TaskRecord[]> {
	return queryTaskRecords(await listTasks(repository), query)
}
