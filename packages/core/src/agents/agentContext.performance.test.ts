import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, describe, expect, it } from 'vitest'
import { serializeDocumentFile } from '../documents/documentRepository.ts'
import { initializeRepository } from '../repository/repository.ts'
import { serializeTaskFile } from '../tasks/taskFile.ts'
import { resolveAgentContext } from './agentContext.ts'

const temporaryDirectories: string[] = []
const ENTITY_COUNT = 1_100
const TIMESTAMP = '2026-11-04 00:00 UTC'

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('resolveAgentContext performance', () => {
	it('keeps one bounded query fast across thousands of canonical entities', async () => {
		const cwd = await mkdtemp(path.join(tmpdir(), 'taskset-agent-context-scale-'))
		temporaryDirectories.push(cwd)
		const repository = await initializeRepository(cwd)
		const writes: Promise<void>[] = []

		for (let index = 1; index <= ENTITY_COUNT; index += 1) {
			const id = index.toString(16).padStart(6, '0')
			writes.push(
				writeFile(
					path.join(
						repository.tasksDirectory,
						`${index.toString().padStart(7, '0')}-task-${id}.md`,
					),
					serializeTaskFile({
						metadata: {
							id,
							title: `Task ${index}`,
							status: 'todo',
							createdAt: TIMESTAMP,
							updatedAt: TIMESTAMP,
						},
						body: '',
					}),
				),
				writeFile(
					path.join(
						repository.documentsDirectory,
						'research',
						`${index.toString().padStart(7, '0')}-research-${(index + ENTITY_COUNT)
							.toString(16)
							.padStart(6, '0')}.md`,
					),
					serializeDocumentFile({
						metadata: {
							id: (index + ENTITY_COUNT).toString(16).padStart(6, '0'),
							type: 'research',
							title: `Research ${index}`,
							status: 'draft',
							createdAt: TIMESTAMP,
							updatedAt: TIMESTAMP,
						},
						body: '',
					}),
				),
			)
		}
		await Promise.all(writes)

		const startedAt = performance.now()
		const context = await resolveAgentContext({ task: '000001', cwd })
		const elapsedMs = performance.now() - startedAt
		if (process.env.TASKSET_REPORT_PERFORMANCE === '1') {
			console.info(
				JSON.stringify({ tasks: ENTITY_COUNT, documents: ENTITY_COUNT, queryMs: elapsedMs }),
			)
		}

		expect(context.task).toMatchObject({ id: '000001', title: 'Task 1' })
		expect(context.documents.total).toBe(0)
		expect(elapsedMs).toBeLessThan(10_000)
	})
})
