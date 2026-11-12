import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import viteConfig, { createSentryPlugins, sanitizeOptimizedDependencySourceMap } from './vite.config'

const sentryPluginMocks = vi.hoisted(() => ({
    plugin: { name: 'sentry-vite-plugin-stub' },
    sentryVitePlugin: vi.fn(),
}))

vi.mock('@sentry/vite-plugin', () => ({ sentryVitePlugin: sentryPluginMocks.sentryVitePlugin }))

const SENTRY_UPLOAD_ENVIRONMENT = {
    SENTRY_AUTH_TOKEN: 'build-secret',
    SENTRY_ORG: 'md2-org',
    SENTRY_PROJECT: 'md2-project',
}

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
    beforeEach(() => {
        sentryPluginMocks.sentryVitePlugin.mockReset()
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('adds no upload plugin when Sentry upload is not configured', () => {
        expect(createSentryPlugins({})).toEqual([])
        expect(sentryPluginMocks.sentryVitePlugin).not.toHaveBeenCalled()
    })

    it('rejects a partial upload configuration with the missing variable names', () => {
        const environment = { SENTRY_AUTH_TOKEN: 'build-secret', SENTRY_ORG: ' ' }

        expect(() => createSentryPlugins(environment))
            .toThrow('Sentry source-map upload is partially configured; missing: SENTRY_ORG, SENTRY_PROJECT')
    })

    it('creates the upload plugin from build-only values without release injection', () => {
        sentryPluginMocks.sentryVitePlugin.mockReturnValueOnce(sentryPluginMocks.plugin)

        const plugins = createSentryPlugins(SENTRY_UPLOAD_ENVIRONMENT)

        expect(plugins).toEqual([sentryPluginMocks.plugin])
        expect(sentryPluginMocks.sentryVitePlugin).toHaveBeenCalledWith({
            authToken: 'build-secret',
            errorHandler: expect.any(Function),
            org: 'md2-org',
            project: 'md2-project',
            release: { create: false, finalize: false, inject: false, setCommits: false },
        })
    })

    it('applies the upload plugin to separately bundled workers', () => {
        vi.stubEnv('SENTRY_AUTH_TOKEN', SENTRY_UPLOAD_ENVIRONMENT.SENTRY_AUTH_TOKEN)
        vi.stubEnv('SENTRY_ORG', SENTRY_UPLOAD_ENVIRONMENT.SENTRY_ORG)
        vi.stubEnv('SENTRY_PROJECT', SENTRY_UPLOAD_ENVIRONMENT.SENTRY_PROJECT)
        sentryPluginMocks.sentryVitePlugin.mockReturnValueOnce(sentryPluginMocks.plugin)

        const workerPlugins = viteConfig.worker?.plugins?.()

        expect(workerPlugins).toEqual([sentryPluginMocks.plugin])
    })

    it('turns a source-map upload error into a build failure', () => {
        createSentryPlugins(SENTRY_UPLOAD_ENVIRONMENT)
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
