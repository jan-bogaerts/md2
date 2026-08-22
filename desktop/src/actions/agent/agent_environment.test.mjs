import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createAgentEnvironment } = require('./agent_environment');

describe('createAgentEnvironment', () => {
    it('removes inherited VS Code debugger auto-attach variables', () => {
        const environment = {
            NODE_OPTIONS: '--require vscode-js-debug/bootloader.js',
            Path: 'C:\\tools',
            vscode_inspector_options: '{"autoAttachMode":"always"}',
        };

        expect(createAgentEnvironment(environment)).toEqual({ Path: 'C:\\tools' });
        expect(environment).toHaveProperty('NODE_OPTIONS');
    });

    it('asks Claude to forward sub-agent text when the parent environment is silent about it', () => {
        expect(createAgentEnvironment({ Path: 'C:/tools' }, 'claude'))
            .toEqual({ CLAUDE_CODE_FORWARD_SUBAGENT_TEXT: '1', Path: 'C:/tools' });
    });

    it('keeps an explicit sub-agent forwarding choice whatever its casing', () => {
        expect(createAgentEnvironment({ claude_code_forward_subagent_text: '0' }, 'claude'))
            .toEqual({ claude_code_forward_subagent_text: '0' });
    });

    it('leaves other agents without the Claude-only forwarding variable', () => {
        expect(createAgentEnvironment({ Path: 'C:/tools' }, 'codex')).toEqual({ Path: 'C:/tools' });
    });
});
