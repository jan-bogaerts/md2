import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversationEvent } from '../../../../data/data_types'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import {
    ClaudeAuthenticationRequiredError,
} from './claude_authentication_required_error'
import { isClaudeAuthenticationRequiredEvent } from './claude_authentication_required_event'

const agentAccountService = vi.hoisted(() => ({ login: vi.fn(async () => undefined) }))

vi.mock('../../../../services/agents/agent_account_service', () => ({ agentAccountService }))

const authenticationError: AgentConversationEvent = {
    accountId: 'claude-work',
    agent: 'claude',
    content: 'Claude sign-in expired. Log in again, then rerun the action.',
    errorKind: 'authenticationRequired',
    id: 'error-1',
    label: 'Claude sign-in required',
    output: 'Failed to authenticate: OAuth session expired and could not be refreshed',
    providerItemId: 'authentication-required:error-1',
    status: 'failed',
    timestamp: 'now',
    type: 'error',
}

describe('ClaudeAuthenticationRequiredError', () => {
    afterEach(() => {
        cleanup()
        agentAccountService.login.mockClear()
        vi.restoreAllMocks()
    })

    it('shows recovery guidance and starts login for the affected account', async () => {
        if (!isClaudeAuthenticationRequiredEvent(authenticationError)) throw new Error('Invalid authentication error fixture')
        const user = userEvent.setup()

        render(
            <AppThemeProvider>
                <ClaudeAuthenticationRequiredError event={authenticationError} />
            </AppThemeProvider>,
        )
        await user.click(screen.getByRole('button', { name: 'Log in' }))

        expect(screen.getByRole('alert')).toHaveTextContent('Claude sign-in expired. Log in again, then rerun the action.')
        expect(agentAccountService.login).toHaveBeenCalledOnce()
        expect(agentAccountService.login).toHaveBeenCalledWith('claude-work')
    })
})
