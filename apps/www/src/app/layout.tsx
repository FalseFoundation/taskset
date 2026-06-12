import type { Metadata } from 'next'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import 'nextra-theme-docs/style.css'
import type { ReactNode } from 'react'

const DOCS_REPOSITORY_BASE = 'https://github.com/FalseFoundation/taskset/tree/main/docs'

export const metadata: Metadata = {
	title: {
		default: 'Taskset',
		template: '%s | Taskset',
	},
	description: 'Git-native task management stored beside the code.',
}

const navbar = <Navbar logo={<b>Taskset</b>} />
const footer = <Footer>MIT {new Date().getFullYear()} © Taskset</Footer>

export default async function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang='en' dir='ltr' suppressHydrationWarning>
			<Head />
			<body>
				<Layout
					navbar={navbar}
					pageMap={await getPageMap()}
					docsRepositoryBase={DOCS_REPOSITORY_BASE}
					footer={footer}
				>
					{children}
				</Layout>
			</body>
		</html>
	)
}
