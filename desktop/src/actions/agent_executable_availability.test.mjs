import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { executableFromCommand, loadAgentExecutableAvailability } = require('./agent_executable_availability')

describe('agent executable availability', () => {
    it('reads bare and quoted executables from configured commands', () => {
        expect(executableFromCommand('codex --flag')).toBe('codex')
        expect(executableFromCommand('"C:\\Program Files\\Claude\\claude.exe" --flag')).toBe('C:\\Program Files\\Claude\\claude.exe')
    })

    it('reports available and unavailable configured agents', async () => {
        const execFileAsync = vi.fn(async (_locator, [executable]) => {
            if (executable === 'claude') throw new Error('not found')
        })

        await expect(loadAgentExecutableAvailability([
            { command: 'codex', name: 'codex' },
            { command: 'claude', name: 'claude' },
        ], { execFileAsync, platform: 'win32' })).resolves.toEqual({
            claude: { available: false, error: 'Executable not found for claude: claude' },
            codex: { available: true, error: null },
        })
        expect(execFileAsync).toHaveBeenCalledWith('where.exe', ['codex'])
    })
})
