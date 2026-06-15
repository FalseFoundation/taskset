import { describe, expect, it } from 'vitest'
import { defineConfig } from '../config/config.ts'
import { buildTaskGraph } from '../graph/taskGraph.ts'
import { BuildTaskIndexOptionsSchema } from '../indexing/taskIndex.ts'
import { parseCoreInput } from './coreValidation.ts'

describe('public core validation', () => {
	it('normalizes Zod failures into stable field-level issues', () => {
		expect(() =>
			defineConfig({
				schemaVersion: 1,
				tasks: { priorities: [] },
			}),
		).toThrow(
			expect.objectContaining({
				name: 'CoreValidationError',
				operation: 'configuration',
				issues: [
					expect.objectContaining({
						field: 'tasks.priorities',
					}),
				],
			}),
		)
	})

	it('validates graph records before inspecting relationships', () => {
		expect(() =>
			buildTaskGraph([
				{
					relativePath: '',
					task: {},
				},
			] as never),
		).toThrow(
			expect.objectContaining({
				name: 'CoreValidationError',
				operation: 'task graph construction',
				issues: expect.arrayContaining([
					expect.objectContaining({ field: '0.relativePath' }),
					expect.objectContaining({ field: '0.task.metadata' }),
				]),
			}),
		)
	})

	it('rejects unknown index options without leaking a ZodError', () => {
		expect(() =>
			parseCoreInput(
				BuildTaskIndexOptionsSchema,
				{ cache: true, stale: true },
				'task index options',
			),
		).toThrow(
			expect.objectContaining({
				name: 'CoreValidationError',
				issues: [expect.objectContaining({ field: 'input' })],
			}),
		)
	})

	it('validates TaskGraph method inputs', () => {
		const graph = buildTaskGraph([])

		expect(() => graph.traverse('', 'dependencies')).toThrow(
			expect.objectContaining({
				name: 'CoreValidationError',
				operation: 'task graph task ID',
				issues: [expect.objectContaining({ field: 'input' })],
			}),
		)
	})
})
