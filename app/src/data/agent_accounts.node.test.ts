import { describe, expect, it } from 'vitest'
import {
    DEFAULT_AGENT_ACCOUNTS,
    resolveAgentAccount,
    resolveAgentAccounts,
    validateAgentAccounts,
    type AgentAccount,
} from './agent_accounts'

const WORK_ACCOUNT_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const PRIVATE_ACCOUNT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

const workAccount: AgentAccount = {
    id: WORK_ACCOUNT_ID,
    agent: 'codex',
    kind: 'directory',
    name: 'Work',
    configDirectory: 'C:\\Users\\me\\.codex-work\\',
}
const privateAccount: AgentAccount = {
    id: PRIVATE_ACCOUNT_ID,
    agent: 'codex',
    kind: 'directory',
    name: 'Private',
    configDirectory: '/home/me/.codex-private',
}

describe('agent accounts', () => {
    it('resolves a missing collection to the initial Codex and Claude accounts', () => {
        const accounts = resolveAgentAccounts(undefined, 'test')

        expect(accounts).toEqual(DEFAULT_AGENT_ACCOUNTS)
        expect(resolveAgentAccount(accounts, 'codex')).toMatchObject({ id: 'codex-initial', kind: 'initial' })
        expect(resolveAgentAccount(accounts, 'claude')).toMatchObject({ id: 'claude-initial', kind: 'initial' })
    })

    it('normalizes directory accounts and keeps their ID when name or directory change', () => {
        const accounts = validateAgentAccounts([...DEFAULT_AGENT_ACCOUNTS, workAccount], 'test')
        expect(accounts[2]).toEqual({ ...workAccount, configDirectory: 'C:/Users/me/.codex-work' })

        const changed = { ...workAccount, name: 'Renamed', configDirectory: 'D:\\codex' }
        const changedAccounts = validateAgentAccounts([...DEFAULT_AGENT_ACCOUNTS, changed], 'test')
        expect(resolveAgentAccount(changedAccounts, 'codex', WORK_ACCOUNT_ID)).toMatchObject({ id: WORK_ACCOUNT_ID, name: 'Renamed' })
    })

    it('allows the initial account to be renamed', () => {
        const renamed = DEFAULT_AGENT_ACCOUNTS.map((account) => ({ ...account, name: `${account.agent} login` }))

        expect(validateAgentAccounts(renamed, 'test')[0].name).toBe('codex login')
    })

    it.each([
        ['duplicate ID', [...DEFAULT_AGENT_ACCOUNTS, workAccount, { ...privateAccount, id: WORK_ACCOUNT_ID }], 'Duplicate agent account ID'],
        ['duplicate name', [...DEFAULT_AGENT_ACCOUNTS, workAccount, { ...privateAccount, name: 'Work' }], 'Duplicate agent account name'],
        [
            'duplicate Windows directory differing in case',
            [...DEFAULT_AGENT_ACCOUNTS, workAccount, { ...privateAccount, agent: 'claude', configDirectory: 'c:/users/ME/.codex-work' }],
            'Duplicate agent account directory',
        ],
        ['relative directory', [...DEFAULT_AGENT_ACCOUNTS, { ...workAccount, configDirectory: 'codex-work' }], 'must be absolute'],
        ['non-UUID directory ID', [...DEFAULT_AGENT_ACCOUNTS, { ...workAccount, id: 'work' }], 'must be a UUID'],
        ['empty name', [...DEFAULT_AGENT_ACCOUNTS, { ...workAccount, name: ' ' }], 'name'],
        ['custom agent', [...DEFAULT_AGENT_ACCOUNTS, { ...workAccount, agent: 'custom' }], 'does not support accounts'],
        ['missing initial account', [DEFAULT_AGENT_ACCOUNTS[0]], 'Missing initial agent account for claude'],
        ['wrong initial ID', [{ ...DEFAULT_AGENT_ACCOUNTS[0], id: 'codex-main' }, DEFAULT_AGENT_ACCOUNTS[1]], 'Invalid initial agent account ID'],
        ['initial with directory', [{ ...DEFAULT_AGENT_ACCOUNTS[0], configDirectory: 'C:/codex' }, DEFAULT_AGENT_ACCOUNTS[1]], 'cannot have a directory'],
        ['unknown kind', [...DEFAULT_AGENT_ACCOUNTS, { ...workAccount, kind: 'token' }], 'Invalid agent account kind'],
    ])('rejects %s', (_label, value, message) => {
        expect(() => validateAgentAccounts(value, 'test')).toThrow(message)
    })

    it('treats POSIX directories differing in case as distinct', () => {
        const upperCase = { ...workAccount, configDirectory: '/home/me/.Codex-private' }

        expect(validateAgentAccounts([...DEFAULT_AGENT_ACCOUNTS, upperCase, privateAccount], 'test')).toHaveLength(4)
    })

    it('rejects explicit unknown, cross-agent, and custom-profile account selections', () => {
        const accounts = validateAgentAccounts([...DEFAULT_AGENT_ACCOUNTS, workAccount], 'test')

        expect(() => resolveAgentAccount(accounts, 'codex', 'missing')).toThrow('Unknown agent account')
        expect(() => resolveAgentAccount(accounts, 'claude', WORK_ACCOUNT_ID)).toThrow('belongs to codex')
        expect(() => resolveAgentAccount(accounts, 'claude', 'codex-initial')).toThrow('belongs to codex')
        expect(() => resolveAgentAccount(accounts, 'custom', 'codex-initial')).toThrow('does not support accounts')
        expect(resolveAgentAccount(accounts, 'custom')).toBeNull()
    })
})
