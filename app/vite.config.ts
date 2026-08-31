import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve, sep } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import { defineConfig } from 'vitest/config'

const OPTIMIZED_DEPENDENCY_MAP_PATH_PREFIX = '/node_modules/.vite/deps/'
const JAVASCRIPT_MAP_EXTENSION = '.js.map'
const LINE_SOURCE_MAP_DIRECTIVE_PATTERN = /^\s*\/\/[#@]\s*sourceMappingURL=.*$/gmu
const BLOCK_SOURCE_MAP_DIRECTIVE_PATTERN = /\/\*[#@]\s*sourceMappingURL=.*?\*\//gsu
const JSON_CONTENT_TYPE = 'application/json'
const LOCAL_URL_BASE = 'http://localhost'
const NODE_TEST_GROUP_ORDER = 0
const SERVICE_TEST_GROUP_ORDER = 1
const UI_TEST_GROUP_ORDER = 2
const REAL_EDITOR_TEST_GROUP_ORDER = 3
const TEST_WORKERS = 2

type NextFunction = (error?: Error) => void

type SourceMapWithSourcesContent = {
    sourcesContent?: unknown
    [key: string]: unknown
}

function requestPathFromUrl(url: string | undefined) {
    if (!url) return null

    return new URL(url, LOCAL_URL_BASE).pathname
}

function isOptimizedDependencyMapRequest(requestPath: string) {
    return requestPath.startsWith(OPTIMIZED_DEPENDENCY_MAP_PATH_PREFIX) && requestPath.endsWith(JAVASCRIPT_MAP_EXTENSION)
}

function isInsideDirectory(filePath: string, directoryPath: string) {
    return filePath.toLowerCase().startsWith(`${directoryPath.toLowerCase()}${sep}`)
}

function resolveOptimizedDependencyMapPath(server: ViteDevServer, requestPath: string) {
    const relativePath = decodeURIComponent(requestPath.slice(1))
    const mapPath = resolve(server.config.root, relativePath)
    const optimizedDependencyDirectory = resolve(server.config.root, 'node_modules', '.vite', 'deps')

    if (!isInsideDirectory(mapPath, optimizedDependencyDirectory)) throw new Error(`Invalid optimized dependency map path: ${requestPath}`)

    return mapPath
}

function stripNestedSourceMapDirectives(source: string) {
    return source
        .replace(LINE_SOURCE_MAP_DIRECTIVE_PATTERN, '')
        .replace(BLOCK_SOURCE_MAP_DIRECTIVE_PATTERN, '')
}

export function sanitizeOptimizedDependencySourceMap(payload: string) {
    const sourceMap = JSON.parse(payload) as SourceMapWithSourcesContent
    if (!Array.isArray(sourceMap.sourcesContent)) return payload

    const sourcesContent = sourceMap.sourcesContent.map((source) => (typeof source === 'string' ? stripNestedSourceMapDirectives(source) : source))

    return JSON.stringify({ ...sourceMap, sourcesContent })
}

async function respondWithSanitizedDependencyMap(
    server: ViteDevServer,
    requestPath: string,
    response: ServerResponse,
    next: NextFunction,
) {
    try {
        const mapPath = resolveOptimizedDependencyMapPath(server, requestPath)
        const payload = await readFile(mapPath, 'utf8')
        response.setHeader('content-type', JSON_CONTENT_TYPE)
        response.end(sanitizeOptimizedDependencySourceMap(payload))
    } catch (error) {
        next(error instanceof Error ? error : new Error('Failed to sanitize optimized dependency source map'))
    }
}

function handleDependencySourceMapRequest(
    server: ViteDevServer,
    request: IncomingMessage,
    response: ServerResponse,
    next: NextFunction,
) {
    const requestPath = requestPathFromUrl(request.url)
    if (!requestPath || !isOptimizedDependencyMapRequest(requestPath)) {
        next()
        return
    }

    void respondWithSanitizedDependencyMap(server, requestPath, response, next)
}

function dependencySourceMapNoiseFilter(): Plugin {
    return {
        name: 'md2-dependency-source-map-noise-filter',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use((request, response, next) => handleDependencySourceMapRequest(server, request, response, next))
        },
    }
}

export default defineConfig({
    base: './',
    build: {sourcemap: false},
    envDir: '../desktop',
    envPrefix: 'MD2_',
    // prismjs (via @lexical/code) only publishes its global `Prism` under `typeof global !== 'undefined'`,
    // which is false in browsers; its language files then reference that global and crash the built app.
    // Point `global` at `globalThis` so the assignment runs. See remote-control http serving (F-045).
    define: {global: 'globalThis'},
    plugins: [react(), dependencySourceMapNoiseFilter()],
    resolve: {
        alias: [
            { find: /^mdi-material-ui\/(.+)$/, replacement: 'mdi-material-ui/esm/$1' },
        ],
    },
    test: {
        // The forks pool can crash under rolldown-vite; threads is stable and faster here.
        pool: 'threads',
        projects: [
            {
                extends: true,
                test: {
                    environment: 'node',
                    fileParallelism: false,
                    include: ['vite.config.test.ts', 'src/**/*.node.test.ts'],
                    isolate: false,
                    maxWorkers: TEST_WORKERS,
                    name: 'unit',
                    sequence: { groupOrder: NODE_TEST_GROUP_ORDER },
                    setupFiles: './src/test/node_setup.ts',
                },
            },
            {
                extends: true,
                test: {
                    environment: 'node',
                    fileParallelism: true,
                    include: ['src/**/*.service.test.ts'],
                    isolate: true,
                    maxWorkers: TEST_WORKERS,
                    name: 'service',
                    sequence: { groupOrder: SERVICE_TEST_GROUP_ORDER },
                    setupFiles: './src/test/service_setup.ts',
                },
            },
            {
                extends: true,
                test: {
                    environment: 'jsdom',
                    exclude: ['src/**/*.grouped.test.tsx', 'src/**/*.node.test.ts', 'src/**/*.real.test.tsx', 'src/**/*.service.test.ts'],
                    fileParallelism: true,
                    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
                    isolate: true,
                    maxWorkers: TEST_WORKERS,
                    name: 'ui',
                    sequence: { groupOrder: UI_TEST_GROUP_ORDER },
                    setupFiles: './src/test/setup.ts',
                },
            },
            {
                extends: true,
                test: {
                    environment: 'jsdom',
                    fileParallelism: false,
                    include: ['src/**/*.real.test.tsx'],
                    isolate: true,
                    maxWorkers: TEST_WORKERS,
                    name: 'real-editor',
                    sequence: { groupOrder: REAL_EDITOR_TEST_GROUP_ORDER },
                    setupFiles: './src/test/real_editor_setup.ts',
                },
            },
        ],
    },
})
