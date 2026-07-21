import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { AgentExecutableResolver, executableFromCommand, loadAgentExecutableAvailability } = require('./agent_executable_availability');

describe('agent executable availability', () => {
    it('reads executable from configured command array', () => {
        expect(executableFromCommand(['codex', '--flag'])).toBe('codex');
        expect(executableFromCommand(['C:\\Program Files\\Claude\\claude.exe', '--flag'])).toBe('C:\\Program Files\\Claude\\claude.exe');
    });

    it('reports available and unavailable configured agents', async () => {
        const execFileAsync = vi.fn(async (_locator, [executable]) => {
            if (executable === 'claude') throw new Error('not found');

            return { stdout: 'C:\\Tools\\codex.CMD\r\n' };
        });

        await expect(loadAgentExecutableAvailability([
            { command: ['codex'], name: 'codex' },
            { command: ['claude'], name: 'claude' },
        ], { execFileAsync, platform: 'win32' })).resolves.toEqual({
            claude: { available: false, error: 'Executable not found for claude: claude' },
            codex: { available: true, error: null },
        });
        expect(execFileAsync).toHaveBeenCalledWith('where.exe', ['codex'], expect.objectContaining({ cwd: expect.any(String), env: process.env }));
    });

    it('caches resolved executable paths for matching execution environments', async () => {
        const execFileAsync = vi.fn(async () => ({ stdout: 'C:\\Tools\\codex.CMD\r\n' }));
        const resolver = new AgentExecutableResolver({ execFileAsync, platform: 'win32' });
        const options = { cwd: 'C:\\project', env: { PATH: 'C:\\Tools', PATHEXT: '.COM;.EXE;.BAT;.CMD' } };

        await expect(resolver.find('codex', options)).resolves.toBe('C:\\Tools\\codex.CMD');
        await expect(resolver.find('codex', options)).resolves.toBe('C:\\Tools\\codex.CMD');
        expect(execFileAsync).toHaveBeenCalledOnce();
    });

    it('selects Windows command shim instead of extensionless shell shim', async () => {
        const execFileAsync = vi.fn(async () => ({stdout: 'C:\\Tools\\codex\r\nC:\\Tools\\codex.CMD\r\nC:\\Other\\codex.EXE\r\n'}));
        const resolver = new AgentExecutableResolver({ execFileAsync, platform: 'win32' });
        const options = { env: { PATH: 'C:\\Tools;C:\\Other', PATHEXT: '.COM;.EXE;.BAT;.CMD' } };

        await expect(resolver.find('codex', options)).resolves.toBe('C:\\Tools\\codex.CMD');
    });
});
