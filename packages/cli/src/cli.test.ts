import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runCli } from './cli.ts'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), 'taskset-cli-'))
	temporaryDirectories.push(directory)
	return directory
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

function createOutput() {
	let stdout = ''
	let stderr = ''

	return {
		get stderr() {
			return stderr
		},
		get stdout() {
			return stdout
		},
		writeStderr(value: string) {
			stderr += value
		},
		writeStdout(value: string) {
			stdout += value
		},
	}
}

describe('runCli', () => {
	it('initializes a repository and supports create, list, show, and config commands', async () => {
		const cwd = await createTemporaryDirectory()
		const initOutput = createOutput()

		expect(
			await runCli(['init'], {
				cwd,
				stderr: initOutput.writeStderr,
				stdout: initOutput.writeStdout,
			}),
		).toBe(0)
		expect(initOutput.stdout).toContain('Initialized Taskset')

		const createOutputState = createOutput()
		expect(
			await runCli(
				[
					'task',
					'create',
					'--title',
					'Use Taskset in this repository',
					'--label',
					'self-hosting',
					'--priority',
					'urgent',
					'--file',
					'taskset.config.ts',
				],
				{
					cwd,
					stderr: createOutputState.writeStderr,
					stdout: createOutputState.writeStdout,
				},
			),
		).toBe(0)
		const taskId = createOutputState.stdout.trim()
		expect(taskId).toMatch(/^TS-[0-9A-HJKMNP-TV-Z]{26}$/u)

		const listOutput = createOutput()
		expect(
			await runCli(['task', 'list'], {
				cwd,
				stderr: listOutput.writeStderr,
				stdout: listOutput.writeStdout,
			}),
		).toBe(0)
		expect(listOutput.stdout).toContain(`${taskId}\ttodo\tUse Taskset in this repository`)

		const showOutput = createOutput()
		expect(
			await runCli(['task', 'show', taskId], {
				cwd,
				stderr: showOutput.writeStderr,
				stdout: showOutput.writeStdout,
			}),
		).toBe(0)
		expect(showOutput.stdout).toContain(`id: ${taskId}`)

		const configOutput = createOutput()
		expect(
			await runCli(['config', '--json'], {
				cwd,
				stderr: configOutput.writeStderr,
				stdout: configOutput.writeStdout,
			}),
		).toBe(0)
		expect(JSON.parse(configOutput.stdout)).toMatchObject({
			rootDirectory: cwd,
			config: {
				schemaVersion: 1,
			},
		})
	})

	it('returns a usage exit code for an unknown command', async () => {
		const output = createOutput()

		expect(
			await runCli(['unknown'], {
				cwd: process.cwd(),
				stderr: output.writeStderr,
				stdout: output.writeStdout,
			}),
		).toBe(2)
		expect(output.stderr).toContain('Usage:')
	})

	it('supports updates, lifecycle transitions, impact queries, and guarded JSON deletion', async () => {
		const cwd = await createTemporaryDirectory()
		await runCli(['init'], { cwd })
		const firstOutput = createOutput()
		await runCli(
			['task', 'create', '--title', 'Core task', '--file', 'packages/core/src/index.ts'],
			{ cwd, stdout: firstOutput.writeStdout, stderr: firstOutput.writeStderr },
		)
		const firstId = firstOutput.stdout.trim()
		const updateOutput = createOutput()

		expect(
			await runCli(
				['task', 'update', firstId, '--title', 'Updated core task', '--status', 'doing', '--json'],
				{ cwd, stdout: updateOutput.writeStdout, stderr: updateOutput.writeStderr },
			),
		).toBe(0)
		expect(JSON.parse(updateOutput.stdout)).toMatchObject({
			id: firstId,
			title: 'Updated core task',
			status: 'doing',
		})
		expect(await runCli(['task', 'status', firstId, 'done'], { cwd })).toBe(0)

		const invalidTransition = createOutput()
		expect(
			await runCli(['task', 'status', firstId, 'doing'], {
				cwd,
				stdout: invalidTransition.writeStdout,
				stderr: invalidTransition.writeStderr,
			}),
		).toBe(1)
		expect(invalidTransition.stderr).toContain('cannot transition')

		const secondOutput = createOutput()
		await runCli(
			[
				'task',
				'create',
				'--title',
				'Dependent CLI task',
				'--depends-on',
				firstId,
				'--file',
				'packages/cli/src/cli.ts',
			],
			{ cwd, stdout: secondOutput.writeStdout, stderr: secondOutput.writeStderr },
		)
		const secondId = secondOutput.stdout.trim()
		const impactOutput = createOutput()
		expect(
			await runCli(['task', 'list', '--file', 'packages/core', '--impact', '--json'], {
				cwd,
				stdout: impactOutput.writeStdout,
				stderr: impactOutput.writeStderr,
			}),
		).toBe(0)
		expect(JSON.parse(impactOutput.stdout)).toMatchObject({
			direct: [{ id: firstId }],
			impacted: [{ id: secondId }],
		})

		const blockedDelete = createOutput()
		expect(
			await runCli(['task', 'delete', firstId, '--json'], {
				cwd,
				stdout: blockedDelete.writeStdout,
				stderr: blockedDelete.writeStderr,
			}),
		).toBe(1)
		expect(blockedDelete.stderr).toContain(secondId)

		const deleteOutput = createOutput()
		expect(
			await runCli(['task', 'delete', firstId, '--remove-dependencies', '--json'], {
				cwd,
				stdout: deleteOutput.writeStdout,
				stderr: deleteOutput.writeStderr,
			}),
		).toBe(0)
		expect(JSON.parse(deleteOutput.stdout)).toMatchObject({ deleted: true, id: firstId })
	})

	it('filters task lists and reports doctor failures with a nonzero exit code', async () => {
		const cwd = await createTemporaryDirectory()
		await runCli(['init'], { cwd })
		await runCli(['task', 'create', '--title', 'Searchable Unicode', '--label', 'query'], { cwd })
		const listOutput = createOutput()
		expect(
			await runCli(['task', 'list', '--label', 'query', '--search', 'unicode', '--json'], {
				cwd,
				stdout: listOutput.writeStdout,
				stderr: listOutput.writeStderr,
			}),
		).toBe(0)
		expect(JSON.parse(listOutput.stdout)).toHaveLength(1)

		await writeFile(path.join(cwd, '.taskset', 'tasks', 'broken.md'), 'not frontmatter\n')
		const doctorOutput = createOutput()
		expect(
			await runCli(['doctor', '--json'], {
				cwd,
				stdout: doctorOutput.writeStdout,
				stderr: doctorOutput.writeStderr,
			}),
		).toBe(1)
		expect(JSON.parse(doctorOutput.stdout)).toMatchObject({
			valid: false,
			diagnostics: [{ code: 'frontmatter' }],
		})
	})

	it('validates metadata with Zod and supports generated views and snapshots', async () => {
		const cwd = await createTemporaryDirectory()
		await runCli(['init'], { cwd })
		const invalidOutput = createOutput()

		expect(
			await runCli(['task', 'create', '--title', 'Invalid', '--estimate', '1.5'], {
				cwd,
				stdout: invalidOutput.writeStdout,
				stderr: invalidOutput.writeStderr,
			}),
		).toBe(2)
		expect(invalidOutput.stderr).toContain('estimate')

		const createOutputState = createOutput()
		expect(
			await runCli(
				[
					'task',
					'create',
					'--title',
					'Metadata task',
					'--owner',
					'platform',
					'--assignee',
					'maintainer',
					'--project',
					'taskset',
					'--directory',
					'packages/core',
					'--json',
				],
				{
					cwd,
					stdout: createOutputState.writeStdout,
					stderr: createOutputState.writeStderr,
				},
			),
		).toBe(0)
		expect(JSON.parse(createOutputState.stdout)).toMatchObject({
			schemaVersion: 2,
			owner: 'platform',
			assignees: ['maintainer'],
			projects: ['taskset'],
		})

		const generateOutput = createOutput()
		expect(
			await runCli(['generate', '--json'], {
				cwd,
				stdout: generateOutput.writeStdout,
				stderr: generateOutput.writeStderr,
			}),
		).toBe(0)
		expect(JSON.parse(generateOutput.stdout).files).toContain('assignee/maintainer.md')

		const snapshotOutput = createOutput()
		expect(
			await runCli(['snapshot', 'create'], {
				cwd,
				stdout: snapshotOutput.writeStdout,
				stderr: snapshotOutput.writeStderr,
			}),
		).toBe(0)
		expect(snapshotOutput.stdout.trim()).toMatch(/^\d{8}T\d{6}Z-[a-f0-9]{12}$/u)
	})

	it('renders set/clear conflicts as field-level usage errors', async () => {
		const cwd = await createTemporaryDirectory()
		await runCli(['init'], { cwd })
		const created = createOutput()
		await runCli(['task', 'create', '--title', 'Conflict target'], {
			cwd,
			stdout: created.writeStdout,
			stderr: created.writeStderr,
		})
		const output = createOutput()

		expect(
			await runCli(
				['task', 'update', created.stdout.trim(), '--owner', 'platform', '--clear-owner'],
				{
					cwd,
					stdout: output.writeStdout,
					stderr: output.writeStderr,
				},
			),
		).toBe(2)
		expect(output.stderr).toContain('owner')
		expect(output.stderr).toContain('clear-owner')
		expect(output.stderr).toContain('Cannot set and clear owner in the same update')
	})

	it('supports repeated path filters, planning ranges, duplicate filters, and derived JSON', async () => {
		const cwd = await createTemporaryDirectory()
		await runCli(['init'], { cwd })
		const targetOutput = createOutput()
		await runCli(['task', 'create', '--title', 'Duplicate target'], {
			cwd,
			stdout: targetOutput.writeStdout,
		})
		const targetId = targetOutput.stdout.trim()
		const directOutput = createOutput()
		await runCli(
			[
				'task',
				'create',
				'--title',
				'Direct match',
				'--estimate',
				'90',
				'--effort',
				'3',
				'--duplicate',
				targetId,
				'--file',
				'packages/core/src/index.ts',
				'--directory',
				'packages/core',
			],
			{ cwd, stdout: directOutput.writeStdout },
		)
		const directId = directOutput.stdout.trim()
		const impactedOutput = createOutput()
		await runCli(['task', 'create', '--title', 'Impacted', '--depends-on', directId], {
			cwd,
			stdout: impactedOutput.writeStdout,
		})
		const impactedId = impactedOutput.stdout.trim()
		const output = createOutput()

		expect(
			await runCli(
				[
					'task',
					'list',
					'--file',
					'packages/missing',
					'--file',
					'packages/core',
					'--directory',
					'packages/core/src',
					'--estimate-min',
					'90',
					'--estimate-max',
					'90',
					'--effort-min',
					'3',
					'--effort-max',
					'3',
					'--duplicate',
					targetId,
					'--impact',
					'--include-derived',
					'--json',
				],
				{ cwd, stdout: output.writeStdout, stderr: output.writeStderr },
			),
		).toBe(0)
		expect(JSON.parse(output.stdout)).toMatchObject({
			direct: [{ id: directId, derived: { blocks: [impactedId] } }],
			impacted: [{ id: impactedId, derived: { blockedBy: [directId] } }],
		})

		const invalidRange = createOutput()
		expect(
			await runCli(['task', 'list', '--estimate-min', '10', '--estimate-max', '5'], {
				cwd,
				stdout: invalidRange.writeStdout,
				stderr: invalidRange.writeStderr,
			}),
		).toBe(2)
		expect(invalidRange.stderr).toContain('estimate-max')
	})

	it('reports generated-view failures as warnings without failing canonical updates', async () => {
		const cwd = await createTemporaryDirectory()
		await runCli(['init'], { cwd })
		const created = createOutput()
		await runCli(['task', 'create', '--title', 'Warning target'], {
			cwd,
			stdout: created.writeStdout,
		})
		const dataDirectory = path.join(cwd, '.taskset')
		await chmod(dataDirectory, 0o555)
		const output = createOutput()

		try {
			expect(
				await runCli(['task', 'update', created.stdout.trim(), '--title', 'Updated'], {
					cwd,
					stdout: output.writeStdout,
					stderr: output.writeStderr,
				}),
			).toBe(0)
		} finally {
			await chmod(dataDirectory, 0o755)
		}

		expect(output.stderr).toContain('warning:')
		expect(output.stderr).toContain('generated views could not be refreshed')
	})
})
