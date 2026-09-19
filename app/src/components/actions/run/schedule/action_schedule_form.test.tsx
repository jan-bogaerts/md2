import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionScheduleForm } from './action_schedule_form'

const tracker = {
    agent: 'codex' as const,
    agentLabel: 'Codex',
    expectedResetAt: '2099-07-07T12:00:00.000Z',
    label: 'Pro · primary · 42% used',
    limitId: 'codex,pro',
    usedPercent: 42,
    windowId: 'primary',
}
const card = { cardInternalId: 'card-2', label: 'Other card · design/F_2.md', registrationState: 'doing' }

describe('ActionScheduleForm controls', () => {
    afterEach(cleanup)

    it('keeps date scheduling controls and emits timestamp changes', () => {
        const onChange = vi.fn()
        render(
            <ActionScheduleForm
                accountTrackers={[]}
                canRegister
                cards={[]}
                message="Schedule registered"
                onChange={onChange}
                onRegister={vi.fn()}
                snapshot={{ message: null, open: true, timestamp: '2099-07-07T10:30', triggerType: 'at' }}
                targetStates={[]}
            />,
        )

        expect(screen.getByLabelText(/Date and time/u)).toHaveValue('2099-07-07T10:30')
        expect(screen.getByLabelText(/Date and time/u)).toBeRequired()
        expect(screen.getByRole('status')).toHaveTextContent('Schedule registered')
        fireEvent.change(screen.getByLabelText(/Date and time/u), { target: { value: '2099-07-08T10:30' } })
        expect(onChange).toHaveBeenCalledWith({ timestamp: '2099-07-08T10:30', type: 'timestamp' })
    })

    it('renders account usage and reset time and emits exact tracker identity', async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(
            <ActionScheduleForm
                accountTrackers={[tracker]}
                canRegister
                cards={[]}
                message={null}
                onChange={onChange}
                onRegister={vi.fn()}
                snapshot={{agent: 'codex', limitId: '', message: null, open: true, triggerType: 'account-reset', windowId: ''}}
                targetStates={[]}
            />,
        )

        await user.click(screen.getByRole('combobox', { name: 'Limit and window' }))
        const option = screen.getByRole('option', { name: /Pro · primary · 42% used · resets/u })
        expect(option).toHaveTextContent('Jul')
        await user.click(option)

        expect(onChange).toHaveBeenCalledWith({ limitId: 'codex,pro', type: 'tracker', windowId: 'primary' })
    })

    it('renders identity-safe card choices and disables incomplete registration', async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(
            <ActionScheduleForm
                accountTrackers={[]}
                canRegister={false}
                cards={[card]}
                message={null}
                onChange={onChange}
                onRegister={vi.fn()}
                snapshot={{ cardInternalId: '', message: null, open: true, targetState: '', triggerType: 'card-state' }}
                targetStates={['ready']}
            />,
        )

        expect(screen.getByRole('button', { name: 'Schedule action' })).toBeDisabled()
        await user.click(screen.getByRole('combobox', { name: 'Card' }))
        await user.click(screen.getByRole('option', { name: 'Other card · design/F_2.md' }))
        await user.click(screen.getByRole('combobox', { name: 'Target state' }))
        await user.click(screen.getByRole('option', { name: 'ready' }))

        expect(onChange).toHaveBeenCalledWith({ cardInternalId: 'card-2', type: 'card' })
        expect(onChange).toHaveBeenCalledWith({ targetState: 'ready', type: 'target-state' })
    })
})
