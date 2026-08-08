import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_AGENT_PROFILES } from '../../../data/agent_profiles'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionAgentSelectors } from './action_agent_selectors'

const handlers = {
    onAgentChange: vi.fn(),
    onModelChange: vi.fn(),
    onPermissionModeChange: vi.fn(),
    onThinkingLevelChange: vi.fn(),
}

describe('ActionAgentSelectors', () => {
    afterEach(cleanup)

    it('shows shared permission choices and explicit full-access warning', () => {
        render(
            <AppThemeProvider>
                <ActionAgentSelectors
                    agent="codex"
                    agentAvailability={{ codex: { available: true, error: null } }}
                    agentProfiles={BUILTIN_AGENT_PROFILES}
                    disabled={false}
                    model="gpt-5.5"
                    selectedAgentModels={['gpt-5.5']}
                    permissionMode="full-access"
                    permissionModeSupported
                    thinkingLevel="high"
                    {...handlers}
                />
            </AppThemeProvider>,
        )

        expect(screen.getByLabelText('Permission mode')).toHaveTextContent('Full access — disables approvals')
    })

    it('reports unsupported capabilities', () => {
        render(
            <AppThemeProvider>
                <ActionAgentSelectors
                    agent="custom"
                    agentAvailability={{ custom: { available: true, error: null } }}
                    agentProfiles={[{ command: ['custom'], models: ['model'], name: 'custom' }]}
                    disabled={false}
                    model="model"
                    selectedAgentModels={['model']}
                    permissionMode=""
                    permissionModeSupported={false}
                    thinkingLevel="none"
                    {...handlers}
                />
            </AppThemeProvider>,
        )

        expect(screen.getByLabelText('Permission mode')).toHaveValue('Permissions unsupported')
    })
})
