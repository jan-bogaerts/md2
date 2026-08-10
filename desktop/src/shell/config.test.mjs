import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    DEFAULT_CODEX_SEARCH_ENABLED,
    DEFAULT_DESKTOP_AGENT,
    DEFAULT_DESKTOP_PERMISSION_MODE,
    DEFAULT_DESKTOP_MODEL,
    DEFAULT_DESKTOP_THINKING_LEVEL,
    DEFAULT_EDITOR_COMMAND,
    DEFAULT_MERGE_CONFLICT_RESOLVER_COMMAND,
    DESKTOP_CONFIG_STORE_KEY,
    readDesktopConfig,
    resolveAppUrl,
    resolveDesktopConfig,
    saveDesktopConfig,
    writeDesktopConfig,
} = require('./config');

function createFakeStore(initial = {}) {
    let data = initial;

    return {
        get: (key) => data[key],
        set: (key, value) => {
            data = { ...data, [key]: value };
        },
    };
}

describe('resolveAppUrl', () => {
    it('requires an app URL for the unpackaged renderer', () => {
        expect(() => resolveAppUrl({})).toThrow('MD2_APP_URL is required for the unpackaged renderer');
    });

    it('uses MD2_APP_URL when configured', () => {
        expect(resolveAppUrl({ MD2_APP_URL: 'https://md2.example.test' })).toBe('https://md2.example.test');
    });
});

describe('resolveDesktopConfig', () => {
    it('defaults desktop config values', () => {
        expect(resolveDesktopConfig({})).toEqual({
            agent: DEFAULT_DESKTOP_AGENT,
            agentProfiles: expect.arrayContaining([expect.objectContaining({ command: ['codex'], name: 'codex' })]),
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            editorCommand: DEFAULT_EDITOR_COMMAND,
            mergeConflictResolverCommand: DEFAULT_MERGE_CONFLICT_RESOLVER_COMMAND,
            model: DEFAULT_DESKTOP_MODEL,
            permissionMode: DEFAULT_DESKTOP_PERMISSION_MODE,
            thinkingLevel: DEFAULT_DESKTOP_THINKING_LEVEL,
        });
    });

    it('uses configured desktop values', () => {
        expect(resolveDesktopConfig({MD2_AGENT: 'custom-codex'})).toEqual({
            agent: DEFAULT_DESKTOP_AGENT,
            agentProfiles: expect.arrayContaining([expect.objectContaining({ command: ['custom-codex'], name: 'codex' })]),
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            editorCommand: DEFAULT_EDITOR_COMMAND,
            mergeConflictResolverCommand: DEFAULT_MERGE_CONFLICT_RESOLVER_COMMAND,
            model: DEFAULT_DESKTOP_MODEL,
            permissionMode: DEFAULT_DESKTOP_PERMISSION_MODE,
            thinkingLevel: DEFAULT_DESKTOP_THINKING_LEVEL,
        });
    });
});

describe('readDesktopConfig', () => {
    it('returns env defaults when nothing is stored', () => {
        const store = createFakeStore();

        expect(readDesktopConfig(store, {})).toEqual({
            agent: DEFAULT_DESKTOP_AGENT,
            agentProfiles: expect.arrayContaining([expect.objectContaining({ name: 'codex' })]),
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            editorCommand: DEFAULT_EDITOR_COMMAND,
            mergeConflictResolverCommand: DEFAULT_MERGE_CONFLICT_RESOLVER_COMMAND,
            model: DEFAULT_DESKTOP_MODEL,
            permissionMode: DEFAULT_DESKTOP_PERMISSION_MODE,
            thinkingLevel: DEFAULT_DESKTOP_THINKING_LEVEL,
        });
    });

    it('lets a stored value override the env default for one field while the other falls back', () => {
        const store = createFakeStore({ [DESKTOP_CONFIG_STORE_KEY]: { agent: 'claude' } });

        expect(readDesktopConfig(store, {})).toEqual({
            agent: 'claude',
            agentProfiles: expect.arrayContaining([expect.objectContaining({ name: 'claude' })]),
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            editorCommand: DEFAULT_EDITOR_COMMAND,
            mergeConflictResolverCommand: DEFAULT_MERGE_CONFLICT_RESOLVER_COMMAND,
            model: DEFAULT_DESKTOP_MODEL,
            permissionMode: DEFAULT_DESKTOP_PERMISSION_MODE,
            thinkingLevel: DEFAULT_DESKTOP_THINKING_LEVEL,
        });
    });

    it('keeps MD2_AGENT scoped to the built-in default profile command', () => {
        const store = createFakeStore({
            [DESKTOP_CONFIG_STORE_KEY]: {
                agent: 'custom',
                agentProfiles: [
                    { command: ['stored-codex'], models: ['GPT 5.5'], name: 'codex' },
                    { command: ['stored-custom'], models: ['custom-model'], name: 'custom' },
                ],
            },
        });

        expect(readDesktopConfig(store, { MD2_AGENT: 'env-codex' })).toEqual({
            agent: 'custom',
            agentProfiles: expect.arrayContaining([
                expect.objectContaining({ command: ['env-codex'], name: 'codex' }),
                expect.objectContaining({ command: ['stored-custom'], name: 'custom' }),
            ]),
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            editorCommand: DEFAULT_EDITOR_COMMAND,
            mergeConflictResolverCommand: DEFAULT_MERGE_CONFLICT_RESOLVER_COMMAND,
            model: DEFAULT_DESKTOP_MODEL,
            permissionMode: DEFAULT_DESKTOP_PERMISSION_MODE,
            thinkingLevel: DEFAULT_DESKTOP_THINKING_LEVEL,
        });
    });

    it('uses built-in models when stored built-in profile models are missing or empty', () => {
        const store = createFakeStore({
            [DESKTOP_CONFIG_STORE_KEY]: {
                agentProfiles: [
                    { command: ['codex'], models: [], name: 'codex' },
                    { command: ['claude'], name: 'claude' },
                ],
            },
        });

        expect(readDesktopConfig(store, {})).toMatchObject({
            agentProfiles: [
                { models: ['gpt-5.5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'], name: 'codex' },
                { models: ['default', 'sonnet', 'fable', 'opus', 'haiku'], name: 'claude' },
            ],
        });
    });

    it('drops invalid stored profiles and keeps the valid ones', () => {
        const store = createFakeStore({
            [DESKTOP_CONFIG_STORE_KEY]: {
                agentProfiles: [
                    { command: ['custom-agent'], models: [], name: 'custom' },
                    { command: ['other-agent'], models: ['other-model'], name: 'other' },
                ],
            },
        });

        expect(readDesktopConfig(store, {})).toMatchObject({agentProfiles: [{ command: ['other-agent'], models: ['other-model'], name: 'other' }]});
    });

    it('falls back to the built-in profiles when no stored profile is valid', () => {
        const store = createFakeStore({[DESKTOP_CONFIG_STORE_KEY]: {agentProfiles: [{ command: 'legacy-string-command', models: ['custom-model'], name: 'custom' }]}});

        expect(readDesktopConfig(store, {})).toMatchObject({
            agentProfiles: [
                expect.objectContaining({ command: ['codex'], name: 'codex' }),
                expect.objectContaining({ command: ['claude'], name: 'claude' }),
            ],
        });
    });
});

describe('writeDesktopConfig', () => {
    it('removes obsolete permission keys from stored desktop config', () => {
        const store = createFakeStore({[DESKTOP_CONFIG_STORE_KEY]: {accessLevel: 'read-only', approvalPolicy: 'never', model: 'gpt-5'}});

        writeDesktopConfig(store, { permissionMode: 'full-access' });

        expect(store.get(DESKTOP_CONFIG_STORE_KEY)).toEqual({ model: 'gpt-5', permissionMode: 'full-access' });
        expect(readDesktopConfig(store, {})).not.toHaveProperty('accessLevel');
        expect(readDesktopConfig(store, {})).not.toHaveProperty('approvalPolicy');
    });

    it('persists values so a subsequent readDesktopConfig reflects them', () => {
        const store = createFakeStore();

        writeDesktopConfig(store, { agent: 'claude' });

        expect(readDesktopConfig(store, {})).toEqual({
            agent: 'claude',
            agentProfiles: expect.arrayContaining([expect.objectContaining({ name: 'claude' })]),
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            editorCommand: DEFAULT_EDITOR_COMMAND,
            mergeConflictResolverCommand: DEFAULT_MERGE_CONFLICT_RESOLVER_COMMAND,
            model: DEFAULT_DESKTOP_MODEL,
            permissionMode: DEFAULT_DESKTOP_PERMISSION_MODE,
            thinkingLevel: DEFAULT_DESKTOP_THINKING_LEVEL,
        });
    });

    it('merges with a previous write instead of overwriting it', () => {
        const store = createFakeStore();

        writeDesktopConfig(store, { agent: 'claude' });
        writeDesktopConfig(store, { model: 'custom-model' });

        expect(readDesktopConfig(store, {})).toEqual({
            agent: 'claude',
            agentProfiles: expect.arrayContaining([expect.objectContaining({ name: 'claude' })]),
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            editorCommand: DEFAULT_EDITOR_COMMAND,
            mergeConflictResolverCommand: DEFAULT_MERGE_CONFLICT_RESOLVER_COMMAND,
            model: 'custom-model',
            permissionMode: DEFAULT_DESKTOP_PERMISSION_MODE,
            thinkingLevel: DEFAULT_DESKTOP_THINKING_LEVEL,
        });
    });

    it('persists disabled Codex web search', () => {
        const store = createFakeStore();

        writeDesktopConfig(store, { codexSearchEnabled: false });

        expect(readDesktopConfig(store, {})).toMatchObject({ codexSearchEnabled: false });
    });

    it('persists custom editor command globally', () => {
        const store = createFakeStore();

        writeDesktopConfig(store, { editorCommand: 'notepad "{{file}}"' });

        expect(readDesktopConfig(store, {})).toMatchObject({ editorCommand: 'notepad "{{file}}"' });
    });

    it('persists merge conflict resolver command globally', () => {
        const store = createFakeStore();

        writeDesktopConfig(store, { mergeConflictResolverCommand: 'merge-tool "{{file}}"' });

        expect(readDesktopConfig(store, {})).toMatchObject({ mergeConflictResolverCommand: 'merge-tool "{{file}}"' });
    });
});

describe('saveDesktopConfig', () => {
    const validConfig = {
        agent: 'custom',
        agentProfiles: [{ command: ['custom-agent'], models: ['custom-model'], name: 'custom' }],
        codexSearchEnabled: false,
        editorCommand: 'code "{{file}}"',
        mergeConflictResolverCommand: '',
        model: 'custom-model',
        permissionMode: 'full-access',
        thinkingLevel: 'high',
    };

    it('validates, persists, and returns normalized complete desktop config', () => {
        const store = createFakeStore();

        expect(saveDesktopConfig(store, validConfig, {})).toEqual(validConfig);
        expect(readDesktopConfig(store, {})).toEqual(validConfig);
    });

    it.each([
        ['agent', { ...validConfig, agent: '' }, 'Missing config field: desktop.agent'],
        ['agent profiles', { ...validConfig, agentProfiles: null }, 'Missing config field: desktop.agentProfiles'],
        ['web search', { ...validConfig, codexSearchEnabled: 'yes' }, 'Missing config field: desktop.codexSearchEnabled'],
        ['editor command', { ...validConfig, editorCommand: 'code file.txt' }, 'requires {{file}} placeholder'],
        ['merge command', { ...validConfig, mergeConflictResolverCommand: 'merge file.txt' }, 'requires {{file}} placeholder'],
        ['model', { ...validConfig, model: null }, 'Missing config field: desktop.model'],
        ['permission mode', { ...validConfig, permissionMode: 'invalid' }, 'Invalid permission mode'],
        ['thinking level', { ...validConfig, thinkingLevel: 'extreme' }, 'Invalid thinking level'],
    ])('rejects invalid %s before persistence', (_field, config, message) => {
        const store = createFakeStore();

        expect(() => saveDesktopConfig(store, config, {})).toThrow(message);
        expect(store.get(DESKTOP_CONFIG_STORE_KEY)).toBeUndefined();
    });
});
