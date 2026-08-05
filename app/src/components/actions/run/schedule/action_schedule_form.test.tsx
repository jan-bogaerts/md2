import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionScheduleForm } from './action_schedule_form'

describe('ActionScheduleForm', () => {
    afterEach(cleanup)

    it('renders timestamp input and registration state', () => {
        render(
            <ActionScheduleForm
                message="Schedule registered"
                onRegister={vi.fn()}
                onTimestampChange={vi.fn()}
                timestamp="2099-07-07T10:30"
            />,
        )

        expect(screen.getByLabelText(/Date and time/u)).toHaveValue('2099-07-07T10:30')
        expect(screen.getByLabelText(/Date and time/u)).toBeRequired()
        expect(screen.getByRole('status')).toHaveTextContent('Schedule registered')
    })

    it('calls form callbacks', () => {
        const onRegister = vi.fn()
        const onTimestampChange = vi.fn()
        render(
            <ActionScheduleForm
                message={null}
                onRegister={onRegister}
                onTimestampChange={onTimestampChange}
                timestamp=""
            />,
        )

        fireEvent.change(screen.getByLabelText(/Date and time/u), { target: { value: '2099-07-07T10:30' } })
        fireEvent.click(screen.getByRole('button', { name: 'Schedule action' }))

        expect(onTimestampChange).toHaveBeenCalled()
        expect(onRegister).toHaveBeenCalled()
    })
})
