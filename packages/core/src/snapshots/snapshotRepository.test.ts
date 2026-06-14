import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeRepository } from '../repository/repository.ts'
import { updateTask } from '../tasks/taskRepository.ts'
import { createSnapshot, listSnapshots, restoreSnapshot } from './snapshotRepository.ts'

const temporaryDirectories: string[] = []
const taskId = 'TS-01J00000000000000000000000'

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('snapshot repository', () => {
	it('creates immutable manifests and previews restore before applying it', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-snapshot-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const taskPath = path.join(repository.tasksDirectory, `${taskId}.md`)
		await writeFile(
			taskPath,
			`---
schemaVersion: 1
id: ${taskId}
title: Original
status: todo
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

Body.
`,
		)
		const snapshot = await createSnapshot(repository, {
			now: () => new Date('2026-06-12T01:02:03.000Z'),
		})

		expect(snapshot.id).toMatch(/^20260612T010203Z-[a-f0-9]{12}$/u)
		expect((await listSnapshots(repository))[0]?.id).toBe(snapshot.id)
		await expect(
			access(path.join(repository.snapshotsDirectory, snapshot.id, 'tasks', `${taskId}.md`)),
		).resolves.toBeUndefined()

		await updateTask(repository, taskId, { title: 'Changed' })
		const preview = await restoreSnapshot(repository, snapshot.id)
		expect(preview).toMatchObject({
			applied: false,
			changes: [{ action: 'update', path: `.taskset/tasks/${taskId}.md` }],
		})
		expect(await readFile(taskPath, 'utf8')).toContain('title: Changed')

		await restoreSnapshot(repository, snapshot.id, { apply: true })
		expect(await readFile(taskPath, 'utf8')).toContain('title: Original')
	})
})
