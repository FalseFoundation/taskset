import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
	type AgentContext,
	createTask,
	initializeRepository,
	resolveAgentContext,
} from '@taskset/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTasksetAgentTools } from './agentTools.ts'

const result: AgentContext = {
	formatVersion: '1',
	task: {
		id: 'a1b2c3',
		path: '.taskset/tasks/0000001-context-a1b2c3.md',
		title: 'Context',
		status: 'todo',
		assignees: [],
		reviewers: [],
		body: { text: '', truncated: false, originalChars: 0 },
	},
	checklist: { total: 0, checked: 0, unchecked: 0 },
	dependencies: { items: [], unresolved: [] },
	parent: null,
	children: { items: [], total: 0, truncated: false },
	program: {
		childrenByStatus: { todo: 0, doing: 0, blocked: 0, done: 0, canceled: 0 },
		openChildIds: [],
		closeoutReady: true,
	},
	documents: { groups: [], total: 0, truncated: false },
	attention: {
		activeConcerns: { items: [], total: 0, truncated: false },
		pendingDecisions: { items: [], total: 0, truncated: false },
		pendingResearch: { items: [], total: 0, truncated: false },
	},
	scopes: { files: [], directories: [], projects: [] },
	execution: { result: 'allowed', reasons: [] },
	warnings: [],
}

const temporaryDirectories: string[] = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('createTasksetAgentTools', () => {
	it('validates input and returns the core result unchanged', async () => {
		const resolveContext = vi.fn(async () => result)
		const tools = createTasksetAgentTools({ resolveContext })
		const tool = tools['taskset.context.resolve']

		await expect(tool.execute({ task: 'a1b2c3', limits: { maxChildren: 2 } })).resolves.toBe(result)
		expect(resolveContext).toHaveBeenCalledWith({ task: 'a1b2c3', limits: { maxChildren: 2 } })

		await expect(tool.execute({ task: 'a1b2c3', repositoryPolicy: 'custom' })).rejects.toThrow(
			'Unrecognized key',
		)
		expect(resolveContext).toHaveBeenCalledTimes(1)
	})

	it('preserves parity with the core resolver', async () => {
		const cwd = await mkdtemp(path.join(tmpdir(), 'taskset-agent-tools-'))
		temporaryDirectories.push(cwd)
		const repository = await initializeRepository(cwd)
		const task = await createTask(
			repository,
			{ title: 'Resolve parity' },
			{ createId: () => 'a1b2c3' },
		)
		const input = { task: task.task.metadata.id, cwd }

		expect(await createTasksetAgentTools()['taskset.context.resolve'].execute(input)).toEqual(
			await resolveAgentContext(input),
		)
	})
})
