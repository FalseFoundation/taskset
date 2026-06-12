import { mkdtemp, rm } from 'node:fs/promises'
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
})
