import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createAgentAccountEnvironment } = require('./agent_account_environment');

const ACCOUNT_DIRECTORY = 'C:/accounts/work';
const codexAccount = { id: '11111111-1111-4111-8111-111111111111', agent: 'codex', kind: 'directory', name: 'work', configDirectory: ACCOUNT_DIRECTORY };
const claudeAccount = { id: '22222222-2222-4222-8222-222222222222', agent: 'claude', kind: 'directory', name: 'work', configDirectory: ACCOUNT_DIRECTORY };

describe('createAgentAccountEnvironment', () => {
    it('keeps the inherited provider environment for the initial account', () => {
        const environment = { CLAUDE_CONFIG_DIR: 'C:/claude', CODEX_HOME: 'C:/codex', NODE_OPTIONS: '--inspect', Path: 'C:/tools' };

        expect(createAgentAccountEnvironment(environment, { id: 'codex-initial', agent: 'codex', kind: 'initial', name: 'Default' }))
            .toEqual({ CLAUDE_CONFIG_DIR: 'C:/claude', CODEX_HOME: 'C:/codex', Path: 'C:/tools' });
    });

    it('sets only CODEX_HOME for a Codex directory account', () => {
        const environment = { CLAUDE_CONFIG_DIR: 'C:/claude', codex_home: 'C:/other', Path: 'C:/tools' };

        expect(createAgentAccountEnvironment(environment, codexAccount))
            .toEqual({ CLAUDE_CONFIG_DIR: 'C:/claude', CODEX_HOME: path.resolve(ACCOUNT_DIRECTORY), Path: 'C:/tools' });
    });

    it('sets only CLAUDE_CONFIG_DIR for a Claude directory account', () => {
        const environment = { CODEX_HOME: 'C:/codex', Path: 'C:/tools' };

        expect(createAgentAccountEnvironment(environment, claudeAccount)).toEqual({
            CLAUDE_CODE_FORWARD_SUBAGENT_TEXT: '1',
            CLAUDE_CONFIG_DIR: path.resolve(ACCOUNT_DIRECTORY),
            CODEX_HOME: 'C:/codex',
            Path: 'C:/tools',
        });
    });

    it('does not mutate the inherited environment', () => {
        const environment = { CODEX_HOME: 'C:/codex' };

        createAgentAccountEnvironment(environment, codexAccount);

        expect(environment).toEqual({ CODEX_HOME: 'C:/codex' });
    });
});
