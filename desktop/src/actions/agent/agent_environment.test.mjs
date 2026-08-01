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
});
