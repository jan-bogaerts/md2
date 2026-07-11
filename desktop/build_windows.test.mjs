import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { buildWindows } = require('./build_windows')

describe('Windows release build', () => {
    it('builds React before packaging Electron', async () => {
        const runNpm = vi.fn(async () => undefined)

        await buildWindows(runNpm)

        expect(runNpm.mock.calls).toEqual([
            [['run', 'build', '--prefix', 'app']],
            [['run', 'package:windows', '--prefix', 'desktop']],
        ])
    })

    it('does not package when the React build fails', async () => {
        const error = new Error('React build failed')
        const runNpm = vi.fn(async () => { throw error })

        await expect(buildWindows(runNpm)).rejects.toBe(error)
        expect(runNpm).toHaveBeenCalledTimes(1)
    })
})
