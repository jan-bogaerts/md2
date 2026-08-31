import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveAgentApproval } from '../../../services/actions/action_run_registry'
import { ActionAgentApproval } from './action_agent_approval'

const approval: LiveAgentApproval = {
    additionalPermissions: {
        fileSystem: { entries: [{ access: 'write', path: { path: 'C:\\repo\\outside', type: 'path' } }], read: null, write: null },
        network: { enabled: true },
    },
    availableDecisions: [
        'accept',
        { applyNetworkPolicyAmendment: { network_policy_amendment: { action: 'allow', host: 'registry.npmjs.org' } } },
        'decline',
        'cancel',
    ],
    command: 'npm publish',
    commandActions: [{ command: 'npm publish', type: 'unknown' }],
    cwd: 'C:\\repo',
    filePaths: [],
    itemId: 'command-1',
    kind: 'commandExecution',
    networkApprovalContext: { host: 'registry.npmjs.org', protocol: 'https' },
    reason: 'Publish package',
    requestId: 41,
    startedAtMs: 1,
    submitted: false,
    threadId: 'thread-1',
    turnId: 'turn-1',
}

describe('ActionAgentApproval', () => {
    afterEach(cleanup)

    it('shows security context and sends exact offered policy decision', async () => {
        const onDecision = vi.fn(async () => undefined)
        render(<ActionAgentApproval approval={approval} onDecision={onDecision} />)

        expect(screen.getByText('Publish package')).toBeInTheDocument()
        expect(screen.getAllByText('npm publish').length).toBeGreaterThan(0)
        expect(screen.getByText('C:\\repo')).toBeInTheDocument()
        expect(screen.getByText('https://registry.npmjs.org')).toBeInTheDocument()
        expect(screen.getByText('Network: enabled')).toBeInTheDocument()
        expect(screen.getByText('write: C:\\repo\\outside')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Allow registry.npmjs.org for session' }))

        await waitFor(() => expect(onDecision).toHaveBeenCalledWith(41, approval.availableDecisions?.[1]))
    })

    it('clips command to one line and toggles exact full command', () => {
        const command = 'powershell -Command "Get-ChildItem\n| Select-Object -First 20"'
        render(<ActionAgentApproval
            approval={{ ...approval, command, commandActions: [{ command, type: 'unknown' }] }}
            onDecision={vi.fn()}
        />)
        const commandButton = screen.getByRole('button', { name: 'Toggle full command' })

        expect(commandButton).toHaveAttribute('aria-expanded', 'false')
        expect(commandButton).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
        expect(commandButton.textContent).toBe(command)
        expect(screen.queryByText('Actions')).not.toBeInTheDocument()
        commandButton.focus()
        expect(commandButton).toHaveFocus()

        fireEvent.click(commandButton)

        expect(commandButton).toHaveAttribute('aria-expanded', 'true')
        expect(commandButton).toHaveStyle({ overflowWrap: 'anywhere', textOverflow: 'clip', whiteSpace: 'pre-wrap' })
        expect(commandButton.textContent).toBe(command)

        fireEvent.click(commandButton)

        expect(commandButton).toHaveAttribute('aria-expanded', 'false')
        expect(commandButton).toHaveStyle({ textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
    })

    it('clips every action to one line and toggles all full actions together', () => {
        const firstAction = 'Get-ChildItem -Recurse C:\\repo'
        const secondAction = 'Select-String -Pattern "approval"\n-CaseSensitive'
        render(<ActionAgentApproval
            approval={{
                ...approval,
                command: 'combined command',
                commandActions: [
                    { command: firstAction, type: 'unknown' },
                    { command: secondAction, type: 'unknown' },
                ],
            }}
            onDecision={vi.fn()}
        />)
        const actionsButton = screen.getByRole('button', { name: 'Toggle full actions' })
        const firstActionValue = screen.getByText(firstAction)
        const secondActionValue = screen.getByText(/Select-String -Pattern "approval"\s+-CaseSensitive/u)

        expect(actionsButton).toHaveAttribute('aria-expanded', 'false')
        expect(firstActionValue).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
        expect(secondActionValue).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })

        fireEvent.click(actionsButton)

        expect(actionsButton).toHaveAttribute('aria-expanded', 'true')
        expect(firstActionValue).toHaveStyle({ overflowWrap: 'anywhere', textOverflow: 'clip', whiteSpace: 'pre-wrap' })
        expect(secondActionValue).toHaveStyle({ overflowWrap: 'anywhere', textOverflow: 'clip', whiteSpace: 'pre-wrap' })

        fireEvent.click(actionsButton)

        expect(actionsButton).toHaveAttribute('aria-expanded', 'false')
        expect(firstActionValue).toHaveStyle({ textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
        expect(secondActionValue).toHaveStyle({ textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
    })

    it('expands each pending approval independently', () => {
        render(<>
            <ActionAgentApproval approval={{ ...approval, command: 'first command', requestId: 1 }} onDecision={vi.fn()} />
            <ActionAgentApproval approval={{ ...approval, command: 'second command', requestId: 2 }} onDecision={vi.fn()} />
        </>)
        const commandButtons = screen.getAllByRole('button', { name: 'Toggle full command' })

        fireEvent.click(commandButtons[0])

        expect(commandButtons[0]).toHaveAttribute('aria-expanded', 'true')
        expect(commandButtons[1]).toHaveAttribute('aria-expanded', 'false')
    })

    it('offers standard decisions and disables them after submission starts', async () => {
        let resolveDecision!: () => void
        const pendingDecision = new Promise<void>((resolve) => {
            resolveDecision = resolve
        })
        const onDecision = vi.fn(() => pendingDecision)
        render(<ActionAgentApproval approval={{ ...approval, availableDecisions: null }} onDecision={onDecision} />)

        fireEvent.click(screen.getByRole('button', { name: 'Stop turn' }))

        expect(onDecision).toHaveBeenCalledWith(41, 'cancel')
        expect(screen.getByRole('button', { name: 'Allow once' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Allow for session' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Stop turn' })).toBeDisabled()
        resolveDecision()
    })

    it('shows affected paths for file approvals', () => {
        render(<ActionAgentApproval approval={{
            ...approval,
            additionalPermissions: null,
            availableDecisions: null,
            command: null,
            commandActions: null,
            cwd: null,
            filePaths: ['app/main.ts', 'desktop/main.js'],
            kind: 'fileChange',
            networkApprovalContext: null,
        }} onDecision={vi.fn()} />)

        expect(screen.getByText('app/main.ts')).toBeInTheDocument()
        expect(screen.getByText('desktop/main.js')).toBeInTheDocument()
    })

    it('collapses tool input, hides permission suggestions, and keeps the session decision', async () => {
        const input = {
            command: 'npm test -- src/actions/agent/claude_usage\n--runInBand',
            description: 'Run claude usage tests',
            timeout: 300000,
        }
        const onDecision = vi.fn(async () => undefined)
        render(<ActionAgentApproval approval={{
            ...approval,
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
            command: 'npm test',
            environmentId: 'local',
            input,
            permissionSuggestions: [{ behavior: 'allow', destination: 'session', tool: 'Bash' }],
            provider: 'claude',
            requestId: 'request-1',
            toolName: 'Bash',
        }} onDecision={onDecision} />)
        const inputButton = screen.getByRole('button', { name: 'Toggle full input' })

        expect(screen.queryByText('Provider')).not.toBeInTheDocument()
        expect(screen.queryByText('claude')).not.toBeInTheDocument()
        expect(screen.queryByText('Environment')).not.toBeInTheDocument()
        expect(screen.queryByText('local')).not.toBeInTheDocument()
        expect(screen.getByText('Bash')).toBeInTheDocument()
        expect(screen.queryByText('Session permission suggestions')).not.toBeInTheDocument()
        expect(screen.queryByText(/"destination": "session"/u)).not.toBeInTheDocument()
        expect(inputButton).toHaveAttribute('aria-expanded', 'false')
        expect(inputButton).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
        expect(inputButton.textContent).toBe(input.command)

        fireEvent.click(inputButton)

        expect(inputButton).toHaveAttribute('aria-expanded', 'true')
        expect(inputButton).toHaveStyle({ overflowWrap: 'anywhere', textOverflow: 'clip', whiteSpace: 'pre-wrap' })
        expect(inputButton.textContent).toBe(JSON.stringify(input, null, 2))

        fireEvent.click(inputButton)
        fireEvent.click(screen.getByRole('button', { name: 'Allow for session' }))

        expect(inputButton).toHaveAttribute('aria-expanded', 'false')
        await waitFor(() => expect(onDecision).toHaveBeenCalledWith('request-1', 'acceptForSession'))
    })

    it('uses compact JSON for a non-string first input field and an empty line for an empty input', () => {
        const { rerender } = render(<ActionAgentApproval
            approval={{ ...approval, input: { options: ['unit', 'ui'], timeout: 300000 }, requestId: 'request-1' }}
            key="request-1"
            onDecision={vi.fn()}
        />)

        expect(screen.getByRole('button', { name: 'Toggle full input' }).textContent).toBe('["unit","ui"]')

        rerender(<ActionAgentApproval
            approval={{ ...approval, input: {}, requestId: 'request-2' }}
            key="request-2"
            onDecision={vi.fn()}
        />)

        expect(screen.getByRole('button', { name: 'Toggle full input' }).textContent).toBe('')
    })

    it('keeps collapsible rows independent and resets them for a new approval', () => {
        const firstApproval = {
            ...approval,
            command: 'combined command',
            commandActions: [{ command: 'first action', type: 'unknown' as const }],
            input: { command: 'input command', timeout: 300000 },
            requestId: 'request-1',
        }
        const { rerender } = render(<ActionAgentApproval approval={firstApproval} key="request-1" onDecision={vi.fn()} />)
        const inputButton = screen.getByRole('button', { name: 'Toggle full input' })

        fireEvent.click(inputButton)

        expect(inputButton).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('button', { name: 'Toggle full command' })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByRole('button', { name: 'Toggle full actions' })).toHaveAttribute('aria-expanded', 'false')

        rerender(<ActionAgentApproval
            approval={{ ...firstApproval, requestId: 'request-2' }}
            key="request-2"
            onDecision={vi.fn()}
        />)

        expect(screen.getByRole('button', { name: 'Toggle full input' })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByRole('button', { name: 'Toggle full command' })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByRole('button', { name: 'Toggle full actions' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('renders a Codex approval without an input row or empty input toggle', () => {
        render(<ActionAgentApproval approval={{
            ...approval,
            command: 'combined command',
            commandActions: [{ command: 'Get-ChildItem C:\\repo', type: 'unknown' }],
            input: null,
            permissionSuggestions: null,
            provider: 'codex',
        }} onDecision={vi.fn()} />)

        expect(screen.queryByText('Input')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Toggle full input' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Toggle full command' })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByRole('button', { name: 'Toggle full actions' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('names the sub agent requesting approval', () => {
        render(<ActionAgentApproval approval={{
            ...approval,
            parentItemId: 'agent-1',
            subAgentLabel: 'Explore',
        }} onDecision={vi.fn()} />)

        expect(screen.getByText('Requested by: Explore')).toBeInTheDocument()
    })
})
