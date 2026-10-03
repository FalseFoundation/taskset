import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { diagnoseRepository } from '../diagnostics/doctor.ts'
import { initializeRepository, loadRepository } from '../repository/repository.ts'
import { getProgramRollup } from '../tasks/programRollup.ts'
import { createTask, updateTask } from '../tasks/taskRepository.ts'
import { createDocument, listDocuments, normalizeDocumentKind } from './documentRepository.ts'

const directories: string[] = []
afterEach(async () =>
	Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true }))),
)

describe('operational memory documents', () => {
	it('creates lesson, concern, and audit kinds with templates and aliases', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'taskset-ops-'))
		directories.push(root)
		const repository = await initializeRepository(root)

		expect(normalizeDocumentKind('antipattern')).toBe('lesson')
		expect(normalizeDocumentKind('concerns')).toBe('concern')
		expect(normalizeDocumentKind('audits')).toBe('audit')

		const lesson = await createDocument(repository, {
			type: 'lesson',
			title: 'Capability flags are enablement only',
			severity: 'high',
			relatedSkills: ['.agents/skills/foo/SKILL.md'],
			packs: ['security'],
		})
		const concern = await createDocument(repository, {
			type: 'concern',
			title: 'Telegram capability must not grant CASL',
			class: 'authz',
			cadence: 'on-release',
			related: [lesson.document.metadata.id],
		})
		const audit = await createDocument(repository, {
			type: 'audit',
			title: 'Public route inventory',
		})

		expect(lesson.document.metadata).toMatchObject({
			type: 'lesson',
			status: 'active',
			severity: 'high',
			relatedSkills: ['.agents/skills/foo/SKILL.md'],
			packs: ['security'],
		})
		expect(lesson.document.body).toContain('## Trigger / symptom')
		expect(concern.document.metadata).toMatchObject({
			type: 'concern',
			status: 'active',
			class: 'authz',
			cadence: 'on-release',
		})
		expect(audit.document.metadata.type).toBe('audit')
		expect(audit.relativePath).toContain('.taskset/audits/')
		expect(await listDocuments(repository, 'lesson')).toHaveLength(1)
		expect(await listDocuments(repository, 'concern')).toHaveLength(1)
	})

	it('rejects lesson bodies missing required headings', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'taskset-ops-'))
		directories.push(root)
		const repository = await initializeRepository(root)
		await expect(
			createDocument(repository, {
				type: 'lesson',
				title: 'Broken lesson',
				body: '# Broken lesson\n\n## Trigger / symptom\n\nOnly one heading.\n',
			}),
		).rejects.toMatchObject({ code: 'document-invalid' })
	})

	it('rolls up program health and enforces optional closeout gates', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'taskset-ops-'))
		directories.push(root)
		await initializeRepository(root)
		await writeFile(
			path.join(root, 'taskset.config.ts'),
			`export default {
	closeout: {
		enforceChildCompletion: true,
		blockDoneWithOpenConcerns: true,
		requireLessonWhenLabeled: ['requires-lesson'],
	},
}
`,
		)
		const repository = await loadRepository(root)
		const parent = await createTask(repository, {
			title: 'Security program',
			body: '# Security program\n\n- [ ] Finish children\n',
		})
		const child = await createTask(repository, {
			title: 'Child work',
			parent: parent.task.metadata.id,
		})
		const concern = await createDocument(repository, {
			type: 'concern',
			title: 'Open authz risk',
			class: 'authz',
			related: [parent.task.metadata.id],
		})

		const rollup = await getProgramRollup(repository, parent.task.metadata.id)
		expect(rollup.children.total).toBe(1)
		expect(rollup.children.openIds).toEqual([child.task.metadata.id])
		expect(rollup.relatedOpenConcerns.map((item) => item.id)).toEqual([
			concern.document.metadata.id,
		])
		expect(rollup.closeoutReady).toBe(false)

		await expect(
			updateTask(repository, parent.task.metadata.id, { status: 'doing' }),
		).resolves.toBeTruthy()
		await expect(
			updateTask(repository, parent.task.metadata.id, { status: 'done' }),
		).rejects.toMatchObject({ code: 'task-transition-invalid' })

		await updateTask(repository, child.task.metadata.id, { status: 'doing' })
		await updateTask(repository, child.task.metadata.id, { status: 'done' })
		await createDocument(repository, {
			type: 'lesson',
			title: 'Capability is not authz',
			related: [parent.task.metadata.id],
		})
		await updateTask(repository, parent.task.metadata.id, {
			labels: ['requires-lesson'],
			related: [concern.document.metadata.id],
			body: '# Security program\n\n- [x] Finish children\n',
		})
		await expect(
			updateTask(repository, parent.task.metadata.id, { status: 'done' }),
		).rejects.toMatchObject({ code: 'task-transition-invalid' })
	})

	it('reports taxonomy and template diagnostics from doctor', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'taskset-ops-'))
		directories.push(root)
		await initializeRepository(root)
		await writeFile(
			path.join(root, 'taskset.config.ts'),
			`export default {
	taxonomy: {
		labels: ['security'],
		mode: 'error',
	},
}
`,
		)
		await writeFile(
			path.join(root, '.taskset', 'tasks', '0000001-unknown-label-task-a1b2c3.md'),
			`---
id: a1b2c3
title: Unknown label task
status: todo
priority: medium
createdAt: 2026-10-03 10:00 UTC
updatedAt: 2026-10-03 10:00 UTC
labels:
  - invented
---

# Unknown label task
`,
		)
		const repository = await loadRepository(root)
		const doctor = await diagnoseRepository(repository)
		expect(doctor.valid).toBe(false)
		expect(doctor.diagnostics.some((item) => item.code === 'unknown-taxonomy')).toBe(true)
	})

	it('imports lessons and concerns from recognized directories', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'taskset-ops-'))
		directories.push(root)
		const repository = await initializeRepository(root)
		const source = path.join(root, 'docs', 'lessons', 'capability.md')
		await mkdir(path.dirname(source), { recursive: true })
		await writeFile(
			source,
			`# Capability flags are enablement only

## Trigger / symptom

Agents confuse capability with authz.

## Incorrect pattern

Grant CASL from capability.

## Correct pattern

Authorize separately.

## Blast radius / severity

high

## Prevention

Doctor + lesson.

## Evidence

task abc
`,
		)
		const { importDocument } = await import('./documentRepository.ts')
		const record = await importDocument(repository, source)
		expect(record.document.metadata.type).toBe('lesson')
	})
})
