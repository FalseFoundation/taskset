import type * as z from 'zod'

export interface CoreValidationIssue {
	readonly field: string
	readonly message: string
}

/**
 * Stable public validation failure that exposes field-level issues without
 * leaking Zod-specific error shapes to core consumers.
 */
export class CoreValidationError extends Error {
	readonly operation: string
	readonly issues: readonly CoreValidationIssue[]

	constructor(operation: string, error: z.ZodError) {
		super(`Invalid ${operation} input`, { cause: error })
		this.name = 'CoreValidationError'
		this.operation = operation
		this.issues = Object.freeze(
			error.issues.map((issue) =>
				Object.freeze({
					field: issue.path.length > 0 ? issue.path.map(String).join('.') : 'input',
					message: issue.message,
				}),
			),
		)
	}
}

/**
 * Validates caller-supplied data at a public core boundary and converts Zod's
 * implementation-specific error into Taskset's stable field-level contract.
 */
export function parseCoreInput<T>(schema: z.ZodType<T>, value: unknown, operation: string): T {
	const result = schema.safeParse(value)

	if (!result.success) {
		throw new CoreValidationError(operation, result.error)
	}

	return result.data
}
