import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeRepository } from '../repository/repository.ts'
import { migrateTasks } from './taskMigration.ts'

const temporaryDirectories: string[] = []
const taskId = 'TS-01J00000000000000000000000'

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('task migration', () => {
	it('dry-runs by default and snapshots before atomically applying schema v2', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-migrate-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const taskPath = path.join(repository.tasksDirectory, `${taskId}.md`)
		await writeFile(
			taskPath,
			`---
schemaVersion: 1
id: ${taskId}
title: Legacy
status: todo
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

Keep this body.
`,
		)

		const preview = await migrateTasks(repository, { to: 2 })
		expect(preview).toMatchObject({ applied: false, changes: [{ taskId, from: 1, to: 2 }] })
		expect(await readFile(taskPath, 'utf8')).toContain('schemaVersion: 1')

		const applied = await migrateTasks(repository, { to: 2, apply: true })
		expect(applied.applied).toBe(true)
		expect(applied.snapshotId).toBeDefined()
		expect(await readFile(taskPath, 'utf8')).toContain('schemaVersion: 2')
		expect(await readFile(taskPath, 'utf8')).toContain('Keep this body.')
	})
})
