import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dialogService } from '../../../services/dialog_service'
import { ActionPromptDraft } from '../../../services/actions/action_prompt_draft_service'
import { ActionAgentPrompt } from './action_agent_prompt'
import { ActionAgentQuestion } from './action_agent_question'

vi.mock('../../editor/markdown_editor', async () => {
    const { forwardRef } = await import('react')

    return {
        MarkdownEditor: forwardRef(function MarkdownEditorMock() {
            return <textarea aria-label="Markdown prompt" readOnly value="" />
        }),
    }
})

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

    it('hides the other field of one option question until other is chosen', () => {
        render(
            <ActionAgentQuestion
                onAnswer={vi.fn(async () => undefined)}
                onDismiss={vi.fn(async () => undefined)}
                questions={[{
                    header: 'Confirm',
                    id: 'confirm',
                    options: [{ label: 'Yes' }, { label: 'No' }],
                    question: 'Proceed?',
                }]}
            />,
        )

        expect(screen.queryByRole('textbox', { name: 'Other answer for Proceed?' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Other' }))

        expect(screen.getByRole('textbox', { name: 'Other answer for Proceed?' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    })

    it('submits nothing when other is clicked for one option question', () => {
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

        fireEvent.click(screen.getByRole('button', { name: 'Other' }))

        expect(onAnswer).not.toHaveBeenCalled()
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

        fireEvent.click(screen.getByRole('button', { name: 'Other' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Other answer for Proceed?' }), { target: { value: 'After review' } })
        fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

        await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ confirm: ['After review'] }))
    })

    it('renders a secret other answer as a password input', () => {
        render(
            <ActionAgentQuestion
                onAnswer={vi.fn(async () => undefined)}
                onDismiss={vi.fn(async () => undefined)}
                questions={[{
                    header: 'Token',
                    id: 'token',
                    isSecret: true,
                    options: [{ label: 'Reuse stored token' }],
                    question: 'Which token?',
                }]}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Other' }))

        expect(screen.getByLabelText('Other answer for Which token?')).toHaveAttribute('type', 'password')
    })

    it('lists provider options in order with other last for a question set', () => {
        render(
            <ActionAgentQuestion
                onAnswer={vi.fn(async () => undefined)}
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

        expect(screen.queryByRole('textbox', { name: 'Other answer for Which approach?' })).not.toBeInTheDocument()
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Which approach?' }))

        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['A', 'B', 'Other'])
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

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Which approach?' }))
        fireEvent.click(screen.getByRole('option', { name: 'Other' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Other answer for Which approach?' }), { target: { value: 'Approach C' } })
        fireEvent.change(screen.getByRole('textbox', { name: 'Why?' }), { target: { value: 'Lower risk' } })
        fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

        await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({
            approach: ['Approach C'],
            reason: ['Lower risk'],
        }))
    })

    it('submits text equal to an option label as a custom answer', async () => {
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

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Which approach?' }))
        fireEvent.click(screen.getByRole('option', { name: 'Other' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Other answer for Which approach?' }), { target: { value: 'A' } })
        fireEvent.change(screen.getByRole('textbox', { name: 'Why?' }), { target: { value: 'Same wording' } })

        expect(screen.getByRole('textbox', { name: 'Other answer for Which approach?' })).toHaveValue('A')
        expect(screen.getByRole('combobox', { name: 'Which approach?' })).toHaveTextContent('Other')

        fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

        await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({
            approach: ['A'],
            reason: ['Same wording'],
        }))
    })

    it('discards the draft text when switching back to a provider option', async () => {
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

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Which approach?' }))
        fireEvent.click(screen.getByRole('option', { name: 'Other' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Other answer for Which approach?' }), { target: { value: 'Approach C' } })
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Which approach?' }))
        fireEvent.click(screen.getByRole('option', { name: 'B' }))

        expect(screen.queryByRole('textbox', { name: 'Other answer for Which approach?' })).not.toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Which approach?' })).toHaveTextContent('B')

        fireEvent.change(screen.getByRole('textbox', { name: 'Why?' }), { target: { value: 'Lower risk' } })
        fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

        await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({
            approach: ['B'],
            reason: ['Lower risk'],
        }))
    })

    it('reveals the other field for one question only', () => {
        render(
            <ActionAgentQuestion
                onAnswer={vi.fn(async () => undefined)}
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

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'When?' }))
        fireEvent.click(screen.getByRole('option', { name: 'Other' }))

        expect(screen.getByRole('textbox', { name: 'Other answer for When?' })).toBeInTheDocument()
        expect(screen.queryByRole('textbox', { name: 'Other answer for Which approach?' })).not.toBeInTheDocument()
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
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'When?' }))
        fireEvent.click(screen.getByRole('option', { name: 'Other' }))
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

        fireEvent.click(screen.getByRole('button', { name: 'Other' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Other answer for Proceed?' }), { target: { value: '   ' } })

        expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
        expect(onAnswer).not.toHaveBeenCalled()
    })

    it('rejects whitespace-only custom answers in a question set', () => {
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

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Which approach?' }))
        fireEvent.click(screen.getByRole('option', { name: 'Other' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Other answer for Which approach?' }), { target: { value: '  ' } })
        fireEvent.change(screen.getByRole('textbox', { name: 'Why?' }), { target: { value: 'Lower risk' } })

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

    it('scrolls a long question inside the capped bottom-block region instead of growing it', () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            bottom: 500,
            height: 500,
            left: 0,
            right: 400,
            top: 0,
            width: 400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        })
        const options = Array.from({ length: 20 }, (_, index) => ({ label: `Option ${index}` }))
        const promptDraft = new ActionPromptDraft('', false)
        render(
            <ActionAgentPrompt
                convertMessage={null}
                promptDraft={promptDraft}
                questionsPanel={(
                    <ActionAgentQuestion
                        onAnswer={vi.fn(async () => undefined)}
                        onDismiss={vi.fn(async () => undefined)}
                        questions={[{ header: 'Approach', id: 'approach', options, question: 'Which approach?' }]}
                    />
                )}
            />,
        )

        expect(screen.getByRole('button', { name: 'Option 19' })).toBeInTheDocument()
        expect(screen.getByTestId('action-questions-region')).toHaveStyle({
            maxHeight: '200px',
            overflowY: 'auto',
        })
        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: 'auto' })
    })
})
