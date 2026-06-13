import Link from 'next/link'
import { getPageMap } from 'nextra/page-map'
import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import 'nextra-theme-docs/style.css'
import type { ReactNode } from 'react'
import { FooterContent } from '../../shared/FooterContent.tsx'

const DOCS_REPOSITORY_BASE = 'https://github.com/FalseFoundation/taskset/tree/main/docs'

const navbar = (
	<Navbar logo={<b>Taskset</b>}>
		<Link href='/posts'>Blog</Link>
	</Navbar>
)
const footer = (
	<Footer>
		<FooterContent />
	</Footer>
)

export default async function DocsLayout({ children }: { children: ReactNode }) {
	return (
		<Layout
			navbar={navbar}
			pageMap={await getPageMap()}
			docsRepositoryBase={DOCS_REPOSITORY_BASE}
			footer={footer}
		>
			{children}
		</Layout>
	)
}
