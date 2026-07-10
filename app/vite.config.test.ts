import { describe, expect, it } from 'vitest'
import { sanitizeOptimizedDependencySourceMap } from './vite.config'

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
