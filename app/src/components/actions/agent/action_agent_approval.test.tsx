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
        render(<ActionAgentApproval approval={{ ...approval, command }} onDecision={vi.fn()} />)
        const commandButton = screen.getByRole('button', { name: 'Toggle full command' })

        expect(commandButton).toHaveAttribute('aria-expanded', 'false')
        expect(commandButton).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
        expect(commandButton.textContent).toBe(command)
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

    it('shows Claude tool input and provider permission suggestions', () => {
        render(<ActionAgentApproval approval={{
            ...approval,
            availableDecisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
            command: 'npm test',
            input: { command: 'npm test' },
            permissionSuggestions: [{ behavior: 'allow', destination: 'session', tool: 'Bash' }],
            provider: 'claude',
            requestId: 'request-1',
            toolName: 'Bash',
        }} onDecision={vi.fn()} />)

        expect(screen.getByText('claude')).toBeInTheDocument()
        expect(screen.getByText('Bash')).toBeInTheDocument()
        expect(screen.getByText(/"command": "npm test"/u)).toBeInTheDocument()
        expect(screen.getByText(/"destination": "session"/u)).toBeInTheDocument()
    })
})
