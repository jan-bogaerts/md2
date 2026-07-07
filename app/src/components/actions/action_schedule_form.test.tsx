import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionScheduleForm } from './action_schedule_form'

describe('ActionScheduleForm', () => {
    afterEach(cleanup)

    it('renders timestamp input and registration state', () => {
        render(
            <ActionScheduleForm
                afterActionName=""
                message="Schedule registered"
                onAfterActionNameChange={vi.fn()}
                onRegister={vi.fn()}
                onTimestampChange={vi.fn()}
                onTriggerTypeChange={vi.fn()}
                timestamp="2026-07-07T10:30"
                triggerType="at"
            />,
        )

        expect(screen.getByLabelText('Schedule timestamp')).toHaveValue('2026-07-07T10:30')
        expect(screen.getByRole('status')).toHaveTextContent('Schedule registered')
    })

    it('renders after action input for afterAction trigger', () => {
        render(
            <ActionScheduleForm
                afterActionName="Run tests"
                message={null}
                onAfterActionNameChange={vi.fn()}
                onRegister={vi.fn()}
                onTimestampChange={vi.fn()}
                onTriggerTypeChange={vi.fn()}
                timestamp=""
                triggerType="afterAction"
            />,
        )

        expect(screen.getByLabelText('After action name')).toHaveValue('Run tests')
        expect(screen.queryByLabelText('Schedule timestamp')).not.toBeInTheDocument()
    })

    it('calls form callbacks', () => {
        const onRegister = vi.fn()
        const onTimestampChange = vi.fn()
        render(
            <ActionScheduleForm
                afterActionName=""
                message={null}
                onAfterActionNameChange={vi.fn()}
                onRegister={onRegister}
                onTimestampChange={onTimestampChange}
                onTriggerTypeChange={vi.fn()}
                timestamp=""
                triggerType="at"
            />,
        )

        fireEvent.change(screen.getByLabelText('Schedule timestamp'), { target: { value: '2026-07-07T10:30' } })
        fireEvent.click(screen.getByRole('button', { name: 'Register schedule' }))

        expect(onTimestampChange).toHaveBeenCalled()
        expect(onRegister).toHaveBeenCalled()
    })
})
