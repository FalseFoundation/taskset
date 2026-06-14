import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyFileTransaction, FileTransactionError } from './fileTransaction.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
	)
})

describe('file transaction', () => {
	it('restores earlier mutations when a later operation fails', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'taskset-transaction-'))
		temporaryDirectories.push(directory)
		const existingPath = path.join(directory, 'existing.md')
		const missingPath = path.join(directory, 'missing.md')
		await writeFile(existingPath, 'original\n')

		await expect(
			applyFileTransaction([
				{
					targetPath: existingPath,
					contents: 'updated\n',
					expectedContents: 'original\n',
				},
				{
					targetPath: missingPath,
					contents: null,
					expectedContents: null,
				},
			]),
		).rejects.toBeInstanceOf(FileTransactionError)

		expect(await readFile(existingPath, 'utf8')).toBe('original\n')
		expect((await readdir(directory)).sort()).toEqual(['existing.md'])
	})
})
