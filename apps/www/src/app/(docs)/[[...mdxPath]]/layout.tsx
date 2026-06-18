import { getPageMap } from 'nextra/page-map'
import type { ReactNode } from 'react'
import { DocsThemeLayout } from '../../../docs/DocsThemeLayout.tsx'
import { excludeMaintainersPageMap } from '../../../docs/pageMap.ts'

export default async function UsageDocsLayout({ children }: { children: ReactNode }) {
	return (
		<DocsThemeLayout pageMap={excludeMaintainersPageMap(await getPageMap())}>
			{children}
		</DocsThemeLayout>
	)
}
