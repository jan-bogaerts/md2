import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dialogService } from '../../../services/dialog_service'
import { ActionAgentQuestion } from './action_agent_question'

describe('ActionAgentQuestion', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('reports a rejected answer and restores submission controls', async () => {
        const onAnswer = vi.fn(async () => {
            throw new Error('Provider unavailable')
        })
        const error = vi.spyOn(dialogService, 'error')
        render(
            <ActionAgentQuestion
                onAnswer={onAnswer}
                onDismiss={vi.fn(async () => undefined)}
                questions={[{ header: 'Reason', id: 'reason', question: 'Why?' }]}
            />,
        )

        fireEvent.change(screen.getByRole('textbox', { name: 'Why?' }), { target: { value: 'Because' } })
        const submit = screen.getByRole('button', { name: 'Submit' })
        fireEvent.click(submit)

        await waitFor(() => expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Provider unavailable' }),
            { fallbackMessage: 'Question answers could not be submitted' },
        ))
        expect(submit).toBeEnabled()
    })

    it('collects option and free-text answers before submitting', async () => {
        const onAnswer = vi.fn(async () => undefined)
        render(
            <ActionAgentQuestion
                onAnswer={onAnswer}
                onDismiss={vi.fn(async () => undefined)}
                questions={[
                    { header: 'Confirm', id: 'confirm', options: [{ label: 'Yes' }, { label: 'No' }], question: 'Proceed?' },
                    { header: 'Reason', id: 'reason', question: 'Why?' },
                ]}
            />,
        )

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Proceed?' }))
        fireEvent.click(screen.getByRole('option', { name: 'Yes' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Why?' }), { target: { value: 'Plan approved' } })
        fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

        await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({
            confirm: ['Yes'],
            reason: ['Plan approved'],
        }))
    })

    it('submits one option immediately from answer buttons', async () => {
        const onAnswer = vi.fn(async () => undefined)
        render(
            <ActionAgentQuestion
                onAnswer={onAnswer}
                onDismiss={vi.fn(async () => undefined)}
                questions={[{
                    header: 'Confirm',
                    id: 'confirm',
                    options: [{ label: 'Yes' }, { label: 'No' }],
                    question: 'Proceed?',
                }]}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Yes' }))

        await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ confirm: ['Yes'] }))
    })

    it('submits a custom answer for one option question that allows other answers', async () => {
        const onAnswer = vi.fn(async () => undefined)
        render(
            <ActionAgentQuestion
                onAnswer={onAnswer}
                onDismiss={vi.fn(async () => undefined)}
                questions={[{
                    header: 'Confirm',
                    id: 'confirm',
                    options: [{ label: 'Yes' }, { label: 'No' }],
                    question: 'Proceed?',
                }]}
            />,
        )

        fireEvent.change(screen.getByRole('textbox', { name: 'Other answer for Proceed?' }), { target: { value: 'After review' } })
        fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

        await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ confirm: ['After review'] }))
    })

    it('submits a custom answer for an option question in a question set', async () => {
        const onAnswer = vi.fn(async () => undefined)
        render(
            <ActionAgentQuestion
                onAnswer={onAnswer}
                onDismiss={vi.fn(async () => undefined)}
                questions={[
                    {
                        header: 'Approach',
                        id: 'approach',
                        options: [{ label: 'A' }, { label: 'B' }],
                        question: 'Which approach?',
                    },
                    { header: 'Reason', id: 'reason', question: 'Why?' },
                ]}
            />,
        )

        fireEvent.change(screen.getByRole('textbox', { name: 'Other answer for Which approach?' }), { target: { value: 'Approach C' } })
        fireEvent.change(screen.getByRole('textbox', { name: 'Why?' }), { target: { value: 'Lower risk' } })
        fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

        await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({
            approach: ['Approach C'],
            reason: ['Lower risk'],
        }))
    })

    it('mixes a standard option and custom option answer without provider other flags', async () => {
        const onAnswer = vi.fn(async () => undefined)
        render(
            <ActionAgentQuestion
                onAnswer={onAnswer}
                onDismiss={vi.fn(async () => undefined)}
                questions={[
                    {
                        header: 'Approach',
                        id: 'approach',
                        options: [{ label: 'A' }, { label: 'B' }],
                        question: 'Which approach?',
                    },
                    {
                        header: 'Timing',
                        id: 'timing',
                        options: [{ label: 'Now' }, { label: 'Later' }],
                        question: 'When?',
                    },
                ]}
            />,
        )

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Which approach?' }))
        fireEvent.click(screen.getByRole('option', { name: 'A' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Other answer for When?' }), { target: { value: 'Tomorrow' } })
        fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

        await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({
            approach: ['A'],
            timing: ['Tomorrow'],
        }))
    })

    it('keeps cancel available and reports dismissal failure', async () => {
        let rejectDismissal!: (reason?: unknown) => void
        const dismissal = new Promise<void>((_resolve, reject) => {
            rejectDismissal = reject
        })
        const onDismiss = vi.fn(async () => dismissal)
        const error = vi.spyOn(dialogService, 'error')
        render(
            <ActionAgentQuestion
                onAnswer={vi.fn(async () => undefined)}
                onDismiss={onDismiss}
                questions={[{
                    header: 'Confirm',
                    id: 'confirm',
                    options: [{ label: 'Yes' }],
                    question: 'Proceed?',
                }]}
            />,
        )

        const cancel = screen.getByRole('button', { name: 'Cancel questions' })
        fireEvent.click(cancel)
        expect(cancel).toBeDisabled()
        rejectDismissal(new Error('Provider unavailable'))

        await waitFor(() => expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Provider unavailable' }),
            { fallbackMessage: 'Questions could not be dismissed' },
        ))
        expect(cancel).toBeEnabled()
        expect(screen.getByText('Proceed?')).toBeInTheDocument()
    })

    it('rejects whitespace-only custom option answers', () => {
        const onAnswer = vi.fn(async () => undefined)
        render(
            <ActionAgentQuestion
                onAnswer={onAnswer}
                onDismiss={vi.fn(async () => undefined)}
                questions={[{
                    header: 'Confirm',
                    id: 'confirm',
                    options: [{ label: 'Yes' }],
                    question: 'Proceed?',
                }]}
            />,
        )

        fireEvent.change(screen.getByRole('textbox', { name: 'Other answer for Proceed?' }), { target: { value: '   ' } })

        expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
        expect(onAnswer).not.toHaveBeenCalled()
    })

    it('dismisses a complete multi-question set', async () => {
        const onDismiss = vi.fn(async () => undefined)
        render(
            <ActionAgentQuestion
                onAnswer={vi.fn(async () => undefined)}
                onDismiss={onDismiss}
                questions={[
                    { header: 'First', id: 'first', options: [{ label: 'A' }], question: 'First?' },
                    { header: 'Second', id: 'second', options: [{ label: 'B' }], question: 'Second?' },
                ]}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Cancel questions' }))

        await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce())
    })
})
