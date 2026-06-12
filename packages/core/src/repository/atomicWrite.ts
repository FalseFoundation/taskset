import { randomUUID } from 'node:crypto'
import { link, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

export async function atomicWriteFileExclusive(
	targetPath: string,
	contents: string,
): Promise<void> {
	const temporaryPath = path.join(
		path.dirname(targetPath),
		`.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
	)
	let operationFailure: { readonly error: unknown } | undefined

	try {
		await writeFile(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' })
		await link(temporaryPath, targetPath)
	} catch (error) {
		operationFailure = { error }
	}

	try {
		await unlink(temporaryPath)
	} catch (error) {
		if (!isMissingFile(error) && !operationFailure) {
			throw error
		}
	}

	if (operationFailure) {
		throw operationFailure.error
	}
}
