import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initializeRepository } from '../repository/repository.ts'
import {
	createDocument,
	executeDocumentBatch,
	importDocument,
	listDocuments,
	readDocument,
	updateDocument,
} from './documentRepository.ts'

const directories: string[] = []
afterEach(async () =>
	Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true }))),
)

describe('document repository', () => {
	it('creates typed templates with sequential title-derived IDs', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'taskset-documents-'))
		directories.push(root)
		const repository = await initializeRepository(root)
		await rm(path.join(repository.documentsDirectory, 'flows'), { recursive: true })
		const first = await createDocument(repository, { type: 'flow', title: 'Sign in via SSO' })
		const second = await createDocument(repository, { type: 'flow', title: 'Verify phone' })
		expect(first.document.metadata.id).toBe('0000001-sign-in-via-sso')
		expect(second.document.metadata.id).toBe('0000002-verify-phone')
		expect(first.document.body).toContain('## User flow')
		expect(await readDocument(repository, first.document.metadata.id)).toEqual(first)
		expect(await listDocuments(repository, 'flow')).toEqual([first, second])
	})

	it('imports existing Markdown and can move the source', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'taskset-documents-'))
		directories.push(root)
		const repository = await initializeRepository(root)
		const source = path.join(root, 'adr', '0042-use-postgres.md')
		await mkdir(path.dirname(source), { recursive: true })
		await writeFile(source, '# ADR-0042: Use Postgres\n\n## Decision\n\nUse it.\n')
		const record = await importDocument(repository, source, { move: true })
		expect(record.document.metadata).toMatchObject({ type: 'decision', title: 'Use Postgres' })
		expect(await readFile(path.join(root, record.relativePath), 'utf8')).toContain('Use it.')
		await expect(readFile(source, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
	})

	it('updates and executes paced create, import, update, and export batches with progress', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'taskset-documents-'))
		directories.push(root)
		const repository = await initializeRepository(root)
		const existing = await createDocument(repository, { type: 'story', title: 'Original story' })
		const source = path.join(root, 'research-source.md')
		await writeFile(source, '# Queue evidence\n\nMeasured evidence.\n')
		const progress: number[] = []
		const results = await executeDocumentBatch(
			repository,
			[
				{ action: 'create', input: { type: 'flow', title: 'Checkout flow' } },
				{ action: 'import', sourcePath: source, options: { type: 'research' } },
				{
					action: 'update',
					id: existing.document.metadata.id,
					type: 'story',
					input: { status: 'ready' },
				},
				{
					action: 'export',
					id: existing.document.metadata.id,
					type: 'story',
					targetPath: 'exports/story.md',
				},
			],
			{ concurrency: 3, onProgress: (event) => progress.push(event.percent) },
		)
		expect(results).toHaveLength(4)
		expect(progress).toEqual([25, 50, 75, 100])
		expect(
			(await readDocument(repository, existing.document.metadata.id, 'story')).document.metadata
				.status,
		).toBe('ready')
		expect(await readFile(path.join(root, 'exports/story.md'), 'utf8')).toContain('Original story')
	})

	it('updates a single document while preserving its identity', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'taskset-documents-'))
		directories.push(root)
		const repository = await initializeRepository(root)
		const created = await createDocument(repository, { type: 'runbook', title: 'Recover workers' })
		const updated = await updateDocument(
			repository,
			created.document.metadata.id,
			{
				status: 'active',
				body: '# Recover workers\n\nUpdated steps.\n',
			},
			'runbook',
		)
		expect(updated.document.metadata.id).toBe(created.document.metadata.id)
		expect(updated.document.body).toContain('Updated steps')
	})
})
