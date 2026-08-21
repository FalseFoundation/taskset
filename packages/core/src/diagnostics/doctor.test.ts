import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeRepository } from '../repository/repository.ts'
import { diagnoseRepository } from './doctor.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

function taskSource(id: string, dependsOn = ''): string {
	return `---
id: ${id}
title: Fixture
status: todo
createdAt: 2026-06-12
updatedAt: 2026-06-12
${dependsOn}---

Fixture body.
`
}

describe('repository doctor', () => {
	it('reports multiple failures deterministically without mutating files', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-doctor-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		const first = 'TS-01J00000000000000000000000'
		const second = 'TS-01J00000000000000000000001'
		const firstPath = path.join(repository.tasksDirectory, 'first.md')
		const secondPath = path.join(repository.tasksDirectory, 'second.md')
		const brokenPath = path.join(repository.tasksDirectory, 'broken.md')
		await writeFile(firstPath, taskSource(first, `dependsOn:\n  - ${second}\n`))
		await writeFile(secondPath, taskSource(second, `dependsOn:\n  - ${first}\n`))
		await writeFile(brokenPath, 'not frontmatter\n')
		const before = await readFile(firstPath, 'utf8')

		const result = await diagnoseRepository(repository)

		expect(result.valid).toBe(false)
		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('frontmatter')
		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('dependency-cycle')
		expect(await readFile(firstPath, 'utf8')).toBe(before)
	})

	it('reports task statuses disabled by configuration', async () => {
		const rootDirectory = await mkdtemp(path.join(tmpdir(), 'taskset-doctor-'))
		temporaryDirectories.push(rootDirectory)
		const repository = await initializeRepository(rootDirectory)
		await writeFile(
			repository.configPath,
			`export default {
	tasks: {
		defaults: {
			status: 'doing',
		},
		statuses: ['doing'],
	},
}
`,
		)
		const configuredRepository = await initializeRepository(rootDirectory)
		await writeFile(
			path.join(configuredRepository.tasksDirectory, 'todo.md'),
			taskSource('TS-01J00000000000000000000000'),
		)

		const result = await diagnoseRepository(configuredRepository)

		expect(result.valid).toBe(false)
		expect(result.diagnostics).toContainEqual(
			expect.objectContaining({
				code: 'disabled-status',
				field: 'status',
				message: 'Status "todo" is not enabled by taskset.config.ts',
			}),
		)
	})
})
