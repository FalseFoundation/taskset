import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { createDocument, documentTemplate } from '../documents/documentRepository.ts'
import { initializeRepository } from '../repository/repository.ts'
import { createTask, updateTask } from '../tasks/taskRepository.ts'
import { resolveAgentContext } from './agentContext.ts'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []

async function createRepository(): Promise<string> {
	const cwd = await mkdtemp(path.join(tmpdir(), 'taskset-agent-context-'))
	temporaryDirectories.push(cwd)
	await initializeRepository(cwd)
	await execFileAsync('git', ['init', '--quiet'], { cwd })
	await execFileAsync('git', ['config', 'user.name', 'Ada Agent'], { cwd })
	return cwd
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('resolveAgentContext', () => {
	it('resolves bounded execution context for a task', async () => {
		const cwd = await createRepository()
		const repository = await initializeRepository(cwd)
		const task = await createTask(
			repository,
			{
				title: 'Ship the query',
				owner: 'Ada Agent',
				assignees: ['Ada Agent'],
				reviewers: ['Grace Reviewer'],
				files: ['packages/core/src/index.ts'],
				directories: ['packages/core'],
				projects: ['core'],
				body: '- [x] Inspect contracts\n- [ ] Implement context\n',
			},
			{ createId: () => 'a1b2c3' },
		)

		const context = await resolveAgentContext({ task: task.relativePath, cwd })

		expect(context).toMatchObject({
			formatVersion: '1',
			task: {
				id: 'a1b2c3',
				path: task.relativePath,
				title: 'Ship the query',
				status: 'todo',
				owner: 'Ada Agent',
				assignees: ['Ada Agent'],
				reviewers: ['Grace Reviewer'],
				body: { text: '- [x] Inspect contracts\n- [ ] Implement context\n', truncated: false },
			},
			checklist: { total: 2, checked: 1, unchecked: 1 },
			scopes: {
				files: ['packages/core/src/index.ts'],
				directories: ['packages/core'],
				projects: ['core'],
			},
			execution: { gitIdentity: 'Ada Agent', result: 'allowed', reasons: [] },
		})
	})

	it('blocks execution when a dependency remains unresolved', async () => {
		const cwd = await createRepository()
		const repository = await initializeRepository(cwd)
		const prerequisite = await createTask(
			repository,
			{ title: 'Prepare the contract', owner: 'Ada Agent' },
			{ createId: () => 'aaa111' },
		)
		const task = await createTask(
			repository,
			{
				title: 'Use the contract',
				owner: 'Ada Agent',
				dependsOn: [prerequisite.task.metadata.id],
			},
			{ createId: () => 'bbb222' },
		)

		const context = await resolveAgentContext({ task: task.task.metadata.id, cwd })

		expect(context.dependencies).toEqual({
			items: [
				{
					id: 'aaa111',
					path: prerequisite.relativePath,
					title: 'Prepare the contract',
					status: 'todo',
				},
			],
			unresolved: ['aaa111'],
		})
		expect(context.execution).toEqual({
			gitIdentity: 'Ada Agent',
			result: 'blocked',
			reasons: ['unresolved_dependencies'],
		})
	})

	it('returns bounded child summaries and program health', async () => {
		const cwd = await createRepository()
		const repository = await initializeRepository(cwd)
		const parent = await createTask(
			repository,
			{ title: 'Program', owner: 'Ada Agent' },
			{ createId: () => 'aaa111' },
		)
		const first = await createTask(
			repository,
			{ title: 'First child', parent: parent.task.metadata.id },
			{ createId: () => 'bbb222' },
		)
		const second = await createTask(
			repository,
			{ title: 'Second child', parent: parent.task.metadata.id },
			{ createId: () => 'ccc333' },
		)
		await updateTask(repository, second.task.metadata.id, { status: 'doing' })
		await updateTask(repository, second.task.metadata.id, { status: 'done' })

		const context = await resolveAgentContext({
			task: parent.task.metadata.id,
			cwd,
			limits: { maxChildren: 1 },
		})

		expect(context.parent).toBeNull()
		expect(context.children).toEqual({
			items: [
				{
					id: 'bbb222',
					path: first.relativePath,
					title: 'First child',
					status: 'todo',
				},
			],
			total: 2,
			truncated: true,
		})
		expect(context.program).toMatchObject({
			childrenByStatus: { todo: 1, doing: 0, blocked: 0, done: 1, canceled: 0 },
			openChildIds: ['bbb222'],
			closeoutReady: false,
		})
		expect(context.warnings).toEqual([
			{
				code: 'children_truncated',
				message: 'Showing 1 of 2 child tasks',
			},
		])
	})

	it('groups related documents and surfaces pending operational memory', async () => {
		const cwd = await createRepository()
		const repository = await initializeRepository(cwd)
		const task = await createTask(
			repository,
			{ title: 'Use durable context', owner: 'Ada Agent' },
			{ createId: () => 'aaa111' },
		)
		const documents = [
			{ type: 'research' as const, title: 'Compare options', status: 'ready' as const },
			{ type: 'decision' as const, title: 'Choose a shape', status: 'draft' as const },
			{ type: 'lesson' as const, title: 'Keep one source', status: 'active' as const },
			{ type: 'concern' as const, title: 'Review scale', status: 'active' as const },
			{ type: 'audit' as const, title: 'Check output', status: 'ready' as const },
		]
		const createdDocuments = []
		for (const [index, document] of documents.entries()) {
			createdDocuments.push(
				await createDocument(repository, {
					...document,
					related: [task.task.metadata.id],
					body: `Summary ${index + 1}.\n\n${documentTemplate(document.type, document.title)}`,
				}),
			)
		}

		const context = await resolveAgentContext({
			task: task.task.metadata.id,
			cwd,
			limits: { maxRelated: 2 },
		})

		expect(context.documents.total).toBe(5)
		expect(context.documents.truncated).toBe(true)
		expect(context.documents.groups).toHaveLength(2)
		expect(context.documents.groups[0]).toMatchObject({
			type: 'decision',
			status: 'draft',
			items: [
				{
					id: createdDocuments[1]?.document.metadata.id,
					title: 'Choose a shape',
					summary: 'Summary 2.',
				},
			],
		})
		expect(context.documents.groups[0]?.items[0]).not.toHaveProperty('body')
		expect(context.attention).toMatchObject({
			activeConcerns: {
				total: 1,
				truncated: false,
				items: [{ id: createdDocuments[3]?.document.metadata.id }],
			},
			pendingDecisions: {
				total: 1,
				truncated: false,
				items: [{ id: createdDocuments[1]?.document.metadata.id }],
			},
			pendingResearch: {
				total: 1,
				truncated: false,
				items: [{ id: createdDocuments[0]?.document.metadata.id }],
			},
		})
		expect(context.program.closeoutReady).toBe(false)
		expect(context.warnings).toContainEqual({
			code: 'documents_truncated',
			message: 'Showing 2 of 5 related documents',
		})
	})

	it('rejects missing and ambiguous task references', async () => {
		const cwd = await createRepository()
		const repository = await initializeRepository(cwd)
		await createTask(repository, { title: 'Same title' }, { createId: () => 'aaa111' })
		const second = await createTask(
			repository,
			{ title: 'Same title' },
			{ createId: () => 'bbb222' },
		)
		await rename(
			path.join(cwd, second.relativePath),
			path.join(cwd, second.relativePath.replace('0000002-', '0000001-')),
		)

		await expect(resolveAgentContext({ task: 'missing', cwd })).rejects.toMatchObject({
			code: 'missing',
			reference: 'missing',
		})
		await expect(resolveAgentContext({ task: '0000001', cwd })).rejects.toMatchObject({
			code: 'ambiguous',
			reference: '0000001',
			candidates: expect.arrayContaining([
				expect.objectContaining({ id: 'aaa111' }),
				expect.objectContaining({ id: 'bbb222' }),
			]),
		})
	})

	it('allows unassigned work and requires confirmation for conflicting ownership', async () => {
		const cwd = await createRepository()
		const repository = await initializeRepository(cwd)
		const unassigned = await createTask(
			repository,
			{ title: 'Unassigned work' },
			{ createId: () => 'aaa111' },
		)
		const conflicting = await createTask(
			repository,
			{ title: 'Owned elsewhere', owner: 'Another Agent', assignees: ['Another Agent'] },
			{ createId: () => 'bbb222' },
		)

		await expect(
			resolveAgentContext({ task: unassigned.task.metadata.id, cwd }),
		).resolves.toMatchObject({
			execution: { gitIdentity: 'Ada Agent', result: 'allowed', reasons: [] },
		})
		await expect(
			resolveAgentContext({ task: conflicting.task.metadata.id, cwd }),
		).resolves.toMatchObject({
			execution: {
				gitIdentity: 'Ada Agent',
				result: 'confirmation_required',
				reasons: ['assigned_to_another_identity'],
			},
		})
	})

	it('bounds task and opted-in document bodies without mutating canonical files', async () => {
		const cwd = await createRepository()
		const repository = await initializeRepository(cwd)
		const task = await createTask(
			repository,
			{ title: 'Bound bodies', body: '0123456789abcdef' },
			{ createId: () => 'aaa111' },
		)
		const document = await createDocument(repository, {
			type: 'research',
			title: 'Long evidence',
			status: 'ready',
			related: [task.task.metadata.id],
			body: `Evidence first.\n\n${documentTemplate('research', 'Long evidence')}`,
		})
		const taskPath = path.join(cwd, task.relativePath)
		const documentPath = path.join(cwd, document.relativePath)
		const before = await Promise.all([readFile(taskPath, 'utf8'), readFile(documentPath, 'utf8')])

		const context = await resolveAgentContext({
			task: task.task.metadata.id,
			cwd,
			includeDocumentBodies: true,
			limits: { maxBodyChars: 8 },
		})

		expect(context.task.body).toEqual({ text: '01234567', truncated: true, originalChars: 17 })
		expect(context.documents.groups[0]?.items[0]?.body).toMatchObject({
			text: 'Evidence',
			truncated: true,
		})
		expect(context.warnings).toEqual(
			expect.arrayContaining([
				{ code: 'task_body_truncated', message: 'Task body was truncated from 17 to 8 characters' },
				expect.objectContaining({ code: 'document_body_truncated' }),
			]),
		)
		expect(await Promise.all([readFile(taskPath, 'utf8'), readFile(documentPath, 'utf8')])).toEqual(
			before,
		)
	})
})
