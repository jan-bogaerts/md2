import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveActionDefinition } = require('./action_definition_resolver');

describe('resolveActionDefinition', () => {
    it('hides cache-backed resolution from callers', async () => {
        const action = { id: 'test' };
        const actionDefinitionCache = { resolve: vi.fn(async () => action) };
        const profiles = [{ name: 'codex' }];

        await expect(resolveActionDefinition(actionDefinitionCache, profiles, 'test')).resolves.toBe(action);
        expect(actionDefinitionCache.resolve).toHaveBeenCalledWith('test', profiles, undefined);
    });
});
