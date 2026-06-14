import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type {
	SyncAdapter,
	SyncChange,
	SyncCheckpoint,
	SyncExternalRecord,
	SyncTaskData,
} from '@taskset/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeRepository } from '../repository/repository.ts'
import { createTask, listTasks, updateTask } from '../tasks/taskRepository.ts'
import {
	applySynchronization,
	planSynchronization,
	SynchronizationError,
} from './synchronization.ts'

const temporaryDirectories: string[] = []
const taskId = 'TS-01J00000000000000000000000'
const now = () => new Date('2026-06-12T02:00:00.000Z')

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

function data(overrides: Partial<SyncTaskData> = {}): SyncTaskData {
	return {
		title: 'Task',
		status: 'todo',
		body: '',
		...overrides,
	}
}

class MemoryAdapter implements SyncAdapter {
	readonly id = 'memory'
	#records: SyncExternalRecord[]
	failApply = false

	constructor(records: readonly SyncExternalRecord[] = []) {
		this.#records = structuredClone(records)
	}

	async read(): Promise<readonly SyncExternalRecord[]> {
		return structuredClone(this.#records)
	}

	async apply(
		changes: readonly SyncChange[],
		checkpoints: readonly SyncCheckpoint[],
	): Promise<readonly SyncExternalRecord[]> {
		if (this.failApply) {
			throw new Error('adapter failed')
		}

		const next = structuredClone(this.#records)
		const originalById = new Map(next.map((record) => [record.identity.externalId, record]))

		for (const change of changes) {
			const original = originalById.get(change.identity.externalId)

			if (change.expectedRevision && original?.revision !== change.expectedRevision) {
				throw new Error('stale adapter revision')
			}
		}

		for (const change of changes) {
			const index = next.findIndex(
				(record) => record.identity.externalId === change.identity.externalId,
			)
			const existing = index >= 0 ? next[index] : undefined
			const revision = String(Number(existing?.revision ?? '0') + 1)
			const record: SyncExternalRecord = {
				identity: { ...change.identity, taskId: change.taskId },
				revision,
				data: change.action === 'delete' ? null : (change.data ?? null),
				baseline:
					change.action === 'delete'
						? { data: null, externalRevision: revision }
						: { data: change.data ?? null, externalRevision: revision },
			}

			if (index >= 0) {
				next[index] = record
			} else {
				next.push(record)
			}
		}

		for (const checkpoint of checkpoints) {
			const index = next.findIndex(
				(record) => record.identity.externalId === checkpoint.identity.externalId,
			)
			const existing = next[index]

			if (!existing) {
				throw new Error('checkpoint record missing')
			}

			next[index] = {
				...existing,
				identity: { ...existing.identity, taskId: checkpoint.taskId },
				baseline: {
					...checkpoint.baseline,
					externalRevision: existing.revision,
				},
			}
		}

		this.#records = next.sort((left, right) =>
			left.identity.externalId.localeCompare(right.identity.externalId),
		)
		return this.read()
	}
}

async function fixtureRepository() {
	const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-sync-'))
	temporaryDirectories.push(rootDirectory)
	return initializeRepository(rootDirectory)
}

describe('synchronization', () => {
	it('classifies unchanged, created, updated, and deleted records', async () => {
		const repository = await fixtureRepository()
		await createTask(
			repository,
			{ title: 'Task' },
			{
				createId: () => taskId,
				now: () => new Date('2026-06-12T00:00:00.000Z'),
			},
		)
		const unchangedAdapter = new MemoryAdapter([
			{
				identity: { provider: 'memory', externalId: 'one', taskId },
				revision: '1',
				data: data(),
			},
		])
		expect(
			(
				await planSynchronization(repository, unchangedAdapter, {
					direction: 'bidirectional',
					now,
				})
			).unchanged,
		).toHaveLength(1)

		const remoteOnlyRepository = await fixtureRepository()
		const remoteOnlyAdapter = new MemoryAdapter([
			{
				identity: { provider: 'memory', externalId: 'remote-only' },
				revision: '1',
				data: data({ title: 'Remote' }),
			},
		])
		const createPlan = await planSynchronization(remoteOnlyRepository, remoteOnlyAdapter, {
			direction: 'pull',
			now,
		})
		expect(createPlan.changes.map((change) => change.action)).toEqual(['create'])
		await applySynchronization(remoteOnlyRepository, remoteOnlyAdapter, createPlan)
		expect(await listTasks(remoteOnlyRepository)).toHaveLength(1)
		expect(
			(
				await planSynchronization(remoteOnlyRepository, remoteOnlyAdapter, {
					direction: 'pull',
					now,
				})
			).unchanged,
		).toHaveLength(1)

		const updateAdapter = new MemoryAdapter([
			{
				identity: { provider: 'memory', externalId: 'one', taskId },
				revision: '2',
				data: data({ title: 'Remote update' }),
				baseline: {
					data: data(),
					localUpdatedAt: '2026-06-12 00:00 UTC',
					externalRevision: '1',
				},
			},
		])
		const updatePlan = await planSynchronization(repository, updateAdapter, {
			direction: 'pull',
			now,
		})
		expect(updatePlan.changes.map((change) => change.action)).toEqual(['update'])

		const deleteAdapter = new MemoryAdapter([
			{
				identity: { provider: 'memory', externalId: 'one', taskId },
				revision: '2',
				data: null,
				baseline: { data: data(), externalRevision: '1' },
			},
		])
		const deletePlan = await planSynchronization(repository, deleteAdapter, {
			direction: 'pull',
			deletionBehavior: 'delete',
			now,
		})
		expect(deletePlan.changes.map((change) => change.action)).toEqual(['delete'])
	})

	it('reports field-level conflicts before mutation', async () => {
		const repository = await fixtureRepository()
		await createTask(
			repository,
			{ title: 'Task' },
			{
				createId: () => taskId,
				now: () => new Date('2026-06-12T00:00:00.000Z'),
			},
		)
		await updateTask(
			repository,
			taskId,
			{ title: 'Local title' },
			{ now: () => new Date('2026-06-12T01:00:00.000Z') },
		)
		const adapter = new MemoryAdapter([
			{
				identity: { provider: 'memory', externalId: 'one', taskId },
				revision: '2',
				data: data({ title: 'Remote title' }),
				baseline: { data: data(), externalRevision: '1' },
			},
		])

		const plan = await planSynchronization(repository, adapter, {
			direction: 'bidirectional',
			now,
		})

		expect(plan.conflicts[0]?.fields.map((field) => field.field)).toEqual(['title'])
		await expect(applySynchronization(repository, adapter, plan)).rejects.toBeInstanceOf(
			SynchronizationError,
		)
	})

	it('does not propagate deletion over unsynchronized edits', async () => {
		const repository = await fixtureRepository()
		await createTask(
			repository,
			{ title: 'Task' },
			{
				createId: () => taskId,
				now: () => new Date('2026-06-12T00:00:00.000Z'),
			},
		)
		await updateTask(
			repository,
			taskId,
			{ title: 'Unsynchronized local edit' },
			{ now: () => new Date('2026-06-12T01:00:00.000Z') },
		)
		const adapter = new MemoryAdapter([
			{
				identity: { provider: 'memory', externalId: 'one', taskId },
				revision: '2',
				data: null,
				baseline: { data: data(), externalRevision: '1' },
			},
		])

		const plan = await planSynchronization(repository, adapter, {
			direction: 'pull',
			deletionBehavior: 'delete',
			now,
		})

		expect(plan.changes).toEqual([])
		expect(plan.conflicts[0]?.fields[0]?.field).toBe('record')
	})

	it('does not mutate canonical tasks when an adapter apply fails', async () => {
		const repository = await fixtureRepository()
		await createTask(
			repository,
			{ title: 'Task' },
			{
				createId: () => taskId,
				now: () => new Date('2026-06-12T00:00:00.000Z'),
			},
		)
		await updateTask(
			repository,
			taskId,
			{ title: 'Local title' },
			{ now: () => new Date('2026-06-12T01:00:00.000Z') },
		)
		const adapter = new MemoryAdapter([
			{
				identity: { provider: 'memory', externalId: 'one', taskId },
				revision: '2',
				data: data({ status: 'doing' }),
				baseline: { data: data(), externalRevision: '1' },
			},
		])
		const plan = await planSynchronization(repository, adapter, {
			direction: 'bidirectional',
			now,
		})
		expect(plan.conflicts).toEqual([])
		expect(plan.changes.map((change) => change.target).sort()).toEqual(['external', 'local'])
		adapter.failApply = true

		await expect(applySynchronization(repository, adapter, plan)).rejects.toThrow('adapter failed')
		expect((await listTasks(repository))[0]?.task.metadata).toMatchObject({
			title: 'Local title',
			status: 'todo',
		})
	})
})
