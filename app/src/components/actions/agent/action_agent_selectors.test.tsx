import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_AGENT_PROFILES } from '../../../data/agent_profiles'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionAgentSelectors } from './action_agent_selectors'

const handlers = {
    onAccessLevelChange: vi.fn(),
    onAgentChange: vi.fn(),
    onApprovalPolicyChange: vi.fn(),
    onModelChange: vi.fn(),
    onThinkingLevelChange: vi.fn(),
}

describe('ActionAgentSelectors', () => {
    afterEach(cleanup)

    it('shows configured access and approval choices', () => {
        render(
            <AppThemeProvider>
                <ActionAgentSelectors
                    accessLevel="workspace-write"
                    agent="codex"
                    agentAvailability={{ codex: { available: true, error: null } }}
                    agentProfiles={BUILTIN_AGENT_PROFILES}
                    approvalPolicy="on-request"
                    disabled={false}
                    model="gpt-5.5"
                    selectedAccessLevels={['read-only', 'workspace-write']}
                    selectedAgentModels={['gpt-5.5']}
                    selectedApprovalPolicies={['on-request', 'never']}
                    thinkingLevel="high"
                    {...handlers}
                />
            </AppThemeProvider>,
        )

        expect(screen.getByLabelText('Access level')).toHaveTextContent('workspace-write')
        expect(screen.getByLabelText('Approval policy')).toHaveTextContent('on-request')
    })

    it('reports unsupported capabilities', () => {
        render(
            <AppThemeProvider>
                <ActionAgentSelectors
                    accessLevel=""
                    agent="custom"
                    agentAvailability={{ custom: { available: true, error: null } }}
                    agentProfiles={[{ command: ['custom'], models: ['model'], name: 'custom' }]}
                    approvalPolicy=""
                    disabled={false}
                    model="model"
                    selectedAccessLevels={[]}
                    selectedAgentModels={['model']}
                    selectedApprovalPolicies={[]}
                    thinkingLevel="none"
                    {...handlers}
                />
            </AppThemeProvider>,
        )

        expect(screen.getByLabelText('Access level')).toHaveValue('Not supported')
        expect(screen.getByLabelText('Approval policy')).toHaveValue('Not supported')
    })
})
