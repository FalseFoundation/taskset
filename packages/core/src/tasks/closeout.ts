import type { DocumentMetadata, TaskMetadata } from '@taskset/contracts'
import type { ResolvedCloseoutConfig } from '../config/config.ts'
import type { DocumentRecord } from '../documents/documentRepository.ts'
import type { TaskRecord } from './taskRepository.ts'

const OPEN_CONCERN_STATUSES = new Set(['draft', 'ready', 'active'])
const OPEN_TASK_STATUSES = new Set(['todo', 'doing', 'blocked'])

export interface CloseoutIssue {
	readonly field: string
	readonly message: string
}

function relatedIds(task: TaskMetadata, documents: readonly DocumentRecord[]): Set<string> {
	const ids = new Set(task.related ?? [])
	for (const document of documents) {
		if (document.document.metadata.related?.includes(task.id)) {
			ids.add(document.document.metadata.id)
		}
	}
	return ids
}

/**
 * Returns closeout blockers when moving a task to `done`. Empty when closeout
 * config is disabled or all gates pass.
 */
export function collectCloseoutIssues(
	closeout: ResolvedCloseoutConfig,
	task: TaskMetadata,
	tasks: readonly TaskRecord[],
	documents: readonly DocumentRecord[],
): readonly CloseoutIssue[] {
	const issues: CloseoutIssue[] = []

	if (closeout.enforceChildCompletion) {
		const openChildren = tasks.filter(
			(record) =>
				record.task.metadata.parent === task.id &&
				OPEN_TASK_STATUSES.has(record.task.metadata.status),
		)
		if (openChildren.length > 0) {
			issues.push({
				field: 'status',
				message: `Cannot mark task done while child tasks remain open: ${openChildren
					.map((record) => record.task.metadata.id)
					.join(', ')}`,
			})
		}
	}

	const related = relatedIds(task, documents)

	if (closeout.blockDoneWithOpenConcerns) {
		const openConcerns = documents.filter((record) => {
			const metadata = record.document.metadata
			return (
				related.has(metadata.id) &&
				metadata.type === 'concern' &&
				OPEN_CONCERN_STATUSES.has(metadata.status)
			)
		})
		if (openConcerns.length > 0) {
			issues.push({
				field: 'related',
				message: `Cannot mark task done while related concerns remain open: ${openConcerns
					.map((record) => record.document.metadata.id)
					.join(', ')}`,
			})
		}
	}

	const requiredLabels = closeout.requireLessonWhenLabeled
	if (requiredLabels.length > 0) {
		const matches = (task.labels ?? []).some((label) => requiredLabels.includes(label))
		if (matches) {
			const hasLesson = documents.some((record) => {
				const metadata: DocumentMetadata = record.document.metadata
				return related.has(metadata.id) && metadata.type === 'lesson'
			})
			if (!hasLesson) {
				issues.push({
					field: 'related',
					message:
						'Cannot mark task done: labeled for lesson closeout but no related lesson document exists',
				})
			}
		}
	}

	return issues
}
