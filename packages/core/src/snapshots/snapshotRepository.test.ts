import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeRepository } from '../repository/repository.ts'
import { updateTask } from '../tasks/taskRepository.ts'
import {
	createSnapshot,
	listSnapshots,
	restoreSnapshot,
	type SnapshotManifest,
} from './snapshotRepository.ts'

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
		expect(Object.keys(snapshot).sort()).toEqual(['createdAt', 'files', 'id'])
		expect((await listSnapshots(repository))[0]?.id).toBe(snapshot.id)
		expect(
			Object.keys(
				JSON.parse(
					await readFile(
						path.join(repository.snapshotsDirectory, snapshot.id, 'manifest.json'),
						'utf8',
					),
				) as Record<string, unknown>,
			).sort(),
		).toEqual(['createdAt', 'files', 'id'])
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

		await expect(
			createSnapshot(repository, {
				now: () => new Date('2026-06-12T01:02:03.000Z'),
			}),
		).rejects.toThrow()
		expect(await readFile(taskPath, 'utf8')).toContain('title: Original')
	})

	it('rejects corrupt snapshot content and an invalid restored graph before mutation', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-snapshot-invalid-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const taskPath = path.join(repository.tasksDirectory, `${taskId}.md`)
		const original = `---
id: ${taskId}
title: Current
status: todo
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

Current.
`
		await writeFile(taskPath, original)
		const snapshot = await createSnapshot(repository, {
			now: () => new Date('2026-06-12T02:00:00.000Z'),
		})
		const archivePath = path.join(
			repository.snapshotsDirectory,
			snapshot.id,
			'tasks',
			`${taskId}.md`,
		)
		await writeFile(archivePath, 'corrupt')

		await expect(restoreSnapshot(repository, snapshot.id, { apply: true })).rejects.toThrow(
			'checksum mismatch',
		)
		expect(await readFile(taskPath, 'utf8')).toBe(original)

		const missingId = 'TS-01J00000000000000000000001'
		const invalidSource = `---
id: ${taskId}
title: Invalid graph
status: todo
createdAt: 2026-06-12
updatedAt: 2026-06-12
dependsOn:
  - ${missingId}
---

Invalid.
`
		await writeFile(archivePath, invalidSource)
		const manifestPath = path.join(repository.snapshotsDirectory, snapshot.id, 'manifest.json')
		const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
			files: { path: string; sha256: string }[]
		}
		const firstFile = manifest.files[0]

		if (!firstFile) {
			throw new Error('Expected snapshot manifest file')
		}

		firstFile.sha256 = createHash('sha256').update(invalidSource).digest('hex')
		await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

		await expect(restoreSnapshot(repository, snapshot.id, { apply: true })).rejects.toThrow(
			`missing task ${missingId}`,
		)
		expect(await readFile(taskPath, 'utf8')).toBe(original)
	})

	it('rejects malformed manifests, duplicate or unsafe paths, and missing archive files', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-snapshot-manifest-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const taskPath = path.join(repository.tasksDirectory, `${taskId}.md`)
		const original = `---
id: ${taskId}
title: Original
status: todo
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

Body.
`
		await writeFile(taskPath, original)
		const snapshot = await createSnapshot(repository, {
			now: () => new Date('2026-06-12T03:00:00.000Z'),
		})
		const snapshotDirectory = path.join(repository.snapshotsDirectory, snapshot.id)
		const manifestPath = path.join(snapshotDirectory, 'manifest.json')
		const originalManifest = await readFile(manifestPath, 'utf8')

		await writeFile(manifestPath, '{not json')
		await expect(restoreSnapshot(repository, snapshot.id, { apply: true })).rejects.toThrow(
			'manifest JSON',
		)

		const manifest = JSON.parse(originalManifest) as SnapshotManifest
		await writeFile(
			manifestPath,
			`${JSON.stringify({ ...manifest, files: [...manifest.files, manifest.files[0]] }, null, 2)}\n`,
		)
		await expect(restoreSnapshot(repository, snapshot.id, { apply: true })).rejects.toThrow(
			'Duplicate Taskset snapshot path',
		)

		await writeFile(
			manifestPath,
			`${JSON.stringify(
				{
					...manifest,
					files: [{ path: '.taskset/../outside.md', sha256: '0'.repeat(64) }],
				},
				null,
				2,
			)}\n`,
		)
		await expect(restoreSnapshot(repository, snapshot.id, { apply: true })).rejects.toThrow(
			'outside .taskset',
		)

		await writeFile(manifestPath, originalManifest)
		await rm(path.join(snapshotDirectory, 'tasks', `${taskId}.md`))
		await expect(restoreSnapshot(repository, snapshot.id, { apply: true })).rejects.toMatchObject({
			code: 'ENOENT',
		})
		expect(await readFile(taskPath, 'utf8')).toBe(original)
	})

	it('reports generated-view restore failures as warnings after canonical success', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-snapshot-warning-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const taskPath = path.join(repository.tasksDirectory, `${taskId}.md`)
		await writeFile(
			taskPath,
			`---
id: ${taskId}
title: Original
status: todo
createdAt: 2026-06-12
updatedAt: 2026-06-12
---

Body.
`,
		)
		const snapshot = await createSnapshot(repository)
		await updateTask(repository, taskId, { title: 'Changed' })
		const failureRepository = Object.freeze({
			...repository,
			generatedDirectory: path.join(repository.dataDirectory, 'missing', 'generated'),
		})
		const warnings: string[] = []

		const result = await restoreSnapshot(failureRepository, snapshot.id, {
			apply: true,
			onWarning: (warning) => warnings.push(warning.message),
		})

		expect(result.applied).toBe(true)
		expect(await readFile(taskPath, 'utf8')).toContain('title: Original')
		expect(warnings).toEqual([expect.stringContaining('generated views could not be refreshed')])
	})
})
