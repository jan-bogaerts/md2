import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    DEFAULT_CODEX_SEARCH_ENABLED,
    DEFAULT_DESKTOP_ACCESS_LEVEL,
    DEFAULT_DESKTOP_AGENT,
    DEFAULT_DESKTOP_APPROVAL_POLICY,
    DEFAULT_DESKTOP_MODEL,
    DESKTOP_CONFIG_STORE_KEY,
    readDesktopConfig,
    resolveAppUrl,
    resolveDesktopConfig,
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
            accessLevel: DEFAULT_DESKTOP_ACCESS_LEVEL,
            agent: DEFAULT_DESKTOP_AGENT,
            agentProfiles: expect.arrayContaining([expect.objectContaining({ command: ['codex'], name: 'codex' })]),
            approvalPolicy: DEFAULT_DESKTOP_APPROVAL_POLICY,
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            model: DEFAULT_DESKTOP_MODEL,
        });
    });

    it('uses configured desktop values', () => {
        expect(resolveDesktopConfig({MD2_AGENT: 'custom-codex'})).toEqual({
            accessLevel: DEFAULT_DESKTOP_ACCESS_LEVEL,
            agent: DEFAULT_DESKTOP_AGENT,
            agentProfiles: expect.arrayContaining([expect.objectContaining({ command: ['custom-codex'], name: 'codex' })]),
            approvalPolicy: DEFAULT_DESKTOP_APPROVAL_POLICY,
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            model: DEFAULT_DESKTOP_MODEL,
        });
    });
});

describe('readDesktopConfig', () => {
    it('returns env defaults when nothing is stored', () => {
        const store = createFakeStore();

        expect(readDesktopConfig(store, {})).toEqual({
            accessLevel: DEFAULT_DESKTOP_ACCESS_LEVEL,
            agent: DEFAULT_DESKTOP_AGENT,
            agentProfiles: expect.arrayContaining([expect.objectContaining({ name: 'codex' })]),
            approvalPolicy: DEFAULT_DESKTOP_APPROVAL_POLICY,
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            model: DEFAULT_DESKTOP_MODEL,
        });
    });

    it('lets a stored value override the env default for one field while the other falls back', () => {
        const store = createFakeStore({ [DESKTOP_CONFIG_STORE_KEY]: { agent: 'claude' } });

        expect(readDesktopConfig(store, {})).toEqual({
            accessLevel: DEFAULT_DESKTOP_ACCESS_LEVEL,
            agent: 'claude',
            agentProfiles: expect.arrayContaining([expect.objectContaining({ name: 'claude' })]),
            approvalPolicy: DEFAULT_DESKTOP_APPROVAL_POLICY,
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            model: DEFAULT_DESKTOP_MODEL,
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
            accessLevel: DEFAULT_DESKTOP_ACCESS_LEVEL,
            agent: 'custom',
            agentProfiles: expect.arrayContaining([
                expect.objectContaining({ command: ['env-codex'], name: 'codex' }),
                expect.objectContaining({ command: ['stored-custom'], name: 'custom' }),
            ]),
            approvalPolicy: DEFAULT_DESKTOP_APPROVAL_POLICY,
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            model: DEFAULT_DESKTOP_MODEL,
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
    it('persists values so a subsequent readDesktopConfig reflects them', () => {
        const store = createFakeStore();

        writeDesktopConfig(store, { agent: 'claude' });

        expect(readDesktopConfig(store, {})).toEqual({
            accessLevel: DEFAULT_DESKTOP_ACCESS_LEVEL,
            agent: 'claude',
            agentProfiles: expect.arrayContaining([expect.objectContaining({ name: 'claude' })]),
            approvalPolicy: DEFAULT_DESKTOP_APPROVAL_POLICY,
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            model: DEFAULT_DESKTOP_MODEL,
        });
    });

    it('merges with a previous write instead of overwriting it', () => {
        const store = createFakeStore();

        writeDesktopConfig(store, { agent: 'claude' });
        writeDesktopConfig(store, { model: 'custom-model' });

        expect(readDesktopConfig(store, {})).toEqual({
            accessLevel: DEFAULT_DESKTOP_ACCESS_LEVEL,
            agent: 'claude',
            agentProfiles: expect.arrayContaining([expect.objectContaining({ name: 'claude' })]),
            approvalPolicy: DEFAULT_DESKTOP_APPROVAL_POLICY,
            codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
            model: 'custom-model',
        });
    });

    it('persists disabled Codex web search', () => {
        const store = createFakeStore();

        writeDesktopConfig(store, { codexSearchEnabled: false });

        expect(readDesktopConfig(store, {})).toMatchObject({ codexSearchEnabled: false });
    });
});
