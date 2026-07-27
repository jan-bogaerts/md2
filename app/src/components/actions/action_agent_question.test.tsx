import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActionAgentQuestion } from './action_agent_question'

describe('ActionAgentQuestion', () => {
    it('collects option and free-text answers before submitting', async () => {
        const onAnswer = vi.fn(async () => undefined)
        render(
            <ActionAgentQuestion
                onAnswer={onAnswer}
                questions={[
                    { header: 'Confirm', id: 'confirm', options: [{ label: 'Yes' }, { label: 'No' }], question: 'Proceed?' },
                    { header: 'Reason', id: 'reason', question: 'Why?' },
                ]}
            />,
        )

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Proceed?' }))
        fireEvent.click(screen.getByRole('option', { name: 'Yes' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Why?' }), { target: { value: 'Plan approved' } })
        fireEvent.click(screen.getByRole('button', { name: 'Answer' }))

        await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({
            confirm: ['Yes'],
            reason: ['Plan approved'],
        }))
    })
})
