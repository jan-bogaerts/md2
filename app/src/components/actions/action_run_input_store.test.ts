import { describe, expect, it } from 'vitest'
import { ActionRunInputStore } from './action_run_input_store'

describe('ActionRunInputStore', () => {
    it('resets agent-dependent run overrides together', () => {
        const store = new ActionRunInputStore()
        store.setAgent('codex', 'gpt-5.5', 'workspace-write', 'on-request')
        store.setAccessLevel('danger-full-access')
        store.setApprovalPolicy('never')

        store.setAgent('claude', 'sonnet', '', 'default')

        expect(store.getSnapshot()).toMatchObject({
            accessLevelOverride: '',
            agentOverride: 'claude',
            approvalPolicyOverride: 'default',
            modelOverride: 'sonnet',
            thinkingLevelOverride: 'none',
        })
    })

    it('records waiting selector changes until settings are applied', () => {
        const store = new ActionRunInputStore()

        store.recordSettingsChangeWhileWaiting()
        expect(store.getSnapshot().settingsChangedWhileWaiting).toBe(true)

        store.markSettingsApplied()
        expect(store.getSnapshot().settingsChangedWhileWaiting).toBe(false)
    })
})
