import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import viteConfig, { createSentryPlugins, sanitizeOptimizedDependencySourceMap } from './vite.config'

const sentryPluginMocks = vi.hoisted(() => ({
    plugin: { name: 'sentry-vite-plugin-stub' },
    sentryVitePlugin: vi.fn(),
}))

vi.mock('@sentry/vite-plugin', () => ({ sentryVitePlugin: sentryPluginMocks.sentryVitePlugin }))

const SENTRY_BUILD_CONFIGURATION = 'SENTRY_AUTH_TOKEN=build-secret\nSENTRY_ORG=md2-org\nSENTRY_PROJECT=md2-project\n'

describe('production build configuration', () => {
    it('uses relative asset paths with hidden source maps and only exposes MD2_ client variables', () => {
        expect(viteConfig).toMatchObject({
            base: './',
            build: { sourcemap: 'hidden' },
            envDir: '../desktop',
            envPrefix: 'MD2_',
        })
    })
})

describe('createSentryPlugins', () => {
    let configurationDirectory: string
    let configurationPath: string

    beforeEach(async () => {
        sentryPluginMocks.sentryVitePlugin.mockReset()
        configurationDirectory = await mkdtemp(join(tmpdir(), 'md2-sentry-build-'))
        configurationPath = join(configurationDirectory, '.env.sentry-build-plugin')
    })

    afterEach(async () => {
        await rm(configurationDirectory, { force: true, recursive: true })
    })

    it('adds no upload plugin when the Sentry build configuration file is absent', () => {
        expect(createSentryPlugins(configurationPath)).toEqual([])
        expect(sentryPluginMocks.sentryVitePlugin).not.toHaveBeenCalled()
    })

    it('creates the upload plugin without release injection when the configuration file exists', async () => {
        await writeFile(configurationPath, SENTRY_BUILD_CONFIGURATION, 'utf8')
        sentryPluginMocks.sentryVitePlugin.mockReturnValueOnce(sentryPluginMocks.plugin)

        const plugins = createSentryPlugins(configurationPath)

        expect(plugins).toEqual([sentryPluginMocks.plugin])
        expect(sentryPluginMocks.sentryVitePlugin).toHaveBeenCalledWith({
            errorHandler: expect.any(Function),
            release: { create: false, finalize: false, inject: false, setCommits: false },
        })
    })

    it('turns a configured source-map upload error into a build failure', async () => {
        await writeFile(configurationPath, SENTRY_BUILD_CONFIGURATION, 'utf8')

        createSentryPlugins(configurationPath)
        const [{ errorHandler }] = sentryPluginMocks.sentryVitePlugin.mock.calls[0]

        expect(() => errorHandler(new Error('Network error'))).toThrow('Sentry source-map upload failed: Network error')
    })
})

describe('sanitizeOptimizedDependencySourceMap', () => {
    it('removes nested source map directives from optimized dependency sources', () => {
        const payload = JSON.stringify({
            file: 'dependency.js',
            mappings: '',
            sources: ['dependency.js'],
            sourcesContent: [
                "export const value = 1;\n//# sourceMappingURL=dependency.js.map\n",
                'export const next = 2;\n/*# sourceMappingURL=next.js.map */',
                null,
            ],
            version: 3,
        })

        const result = JSON.parse(sanitizeOptimizedDependencySourceMap(payload)) as { sourcesContent: unknown[] }

        expect(result.sourcesContent).toEqual([
            'export const value = 1;\n\n',
            'export const next = 2;\n',
            null,
        ])
    })
})
