import { describe, expect, it } from 'vitest'
import {
	EntityReferenceError,
	EntityReferenceIndex,
	type EntityReferenceTarget,
} from './entityReference.ts'

const targets: readonly EntityReferenceTarget[] = [
	{
		id: 'a1b2c3',
		relativePath: '.taskset/tasks/0000042-parent-task-a1b2c3.md',
		title: 'Parent task',
		kind: 'task',
		status: 'doing',
		aliases: ['0000042-parent-task'],
	},
	{
		id: 'd4e5f6',
		relativePath: '.taskset/decisions/0000012-decision-d4e5f6.md',
		title: 'Decision',
		kind: 'decision',
		status: 'accepted',
	},
]

describe('EntityReferenceIndex', () => {
	it.each([
		'a1b2c3',
		'.taskset/tasks/0000042-parent-task-a1b2c3.md',
		'0000042-parent-task-a1b2c3.md',
		'0000042-parent-task',
		'0000042',
	])('resolves %s to the immutable identity', (reference) => {
		expect(new EntityReferenceIndex(targets).resolve(reference)).toMatchObject({ id: 'a1b2c3' })
	})

	it('rejects ambiguous basenames with every candidate path', () => {
		const duplicate = {
			...targets[0],
			id: 'abcde',
			relativePath: '.taskset/flows/0000042-parent-task-a1b2c3.md',
			kind: 'flow',
		} satisfies EntityReferenceTarget
		const index = new EntityReferenceIndex([...targets, duplicate])

		expect(() => index.resolve('0000042-parent-task-a1b2c3.md')).toThrow(EntityReferenceError)
		try {
			index.resolve('0000042-parent-task-a1b2c3.md')
		} catch (error) {
			expect(error).toMatchObject({ code: 'ambiguous' })
			expect((error as Error).message).toContain(duplicate.relativePath)
		}
	})
})
