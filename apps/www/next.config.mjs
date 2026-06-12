import nextra from 'nextra'

const withNextra = nextra({})
const isGitHubPages = process.env.GITHUB_PAGES === 'true'
const githubPagesBasePath = process.env.GITHUB_PAGES_BASE_PATH ?? ''

export default withNextra({
	reactCompiler: true,
	reactStrictMode: true,
	typedRoutes: false,
	...(isGitHubPages && {
		basePath: githubPagesBasePath,
		images: {
			unoptimized: true,
		},
		output: 'export',
		trailingSlash: true,
	}),
	devIndicators: {
		position: 'bottom-right',
	},
	experimental: {
		appNewScrollHandler: true,
		externalDir: true,
		viewTransition: true,
	},
	turbopack: {
		resolveAlias: {
			'next-mdx-import-source-file': './mdx-components.tsx',
		},
	},
})
