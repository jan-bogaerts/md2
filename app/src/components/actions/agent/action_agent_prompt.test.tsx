import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionAgentPrompt } from './action_agent_prompt'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../../data/action_placeholders'
import { ActionPromptDraft } from '../../../services/actions/action_prompt_draft_service'
import type { MarkdownDraftBinding } from '../../../services/markdown/markdown_draft'

vi.mock('../../editor/markdown_editor', async () => {
    const { forwardRef, useEffect, useImperativeHandle, useRef, useState } = await import('react')

    return {
        MarkdownEditor: forwardRef(function MarkdownEditorMock(props: {
            attachmentHandler?: (files: File[], insertMarkdown: (markdown: string) => void) => Promise<void>
            draft: MarkdownDraftBinding
            flushOnBlur?: boolean
            hideAttachmentControl?: boolean
            imagePasteHandler?: (file: File, insertMarkdown: (markdown: string) => void) => Promise<void>
            localTextSearch?: boolean
            monospace?: boolean
            onChange?: (markdown: string) => void
            onLiveChange?: (markdown: string) => void
            placeholders?: readonly { name: string }[]
            readOnly?: boolean
        }, ref) {
            const valueRef = useRef(props.draft.getSnapshot())
            const [value, setValue] = useState(props.draft.getSnapshot())
            useEffect(() => props.draft.subscribeEditor(() => {
                const replacement = props.draft.getSnapshot()
                valueRef.current = replacement
                setValue(replacement)
            }), [props.draft])
            useImperativeHandle(ref, () => ({
                flush: () => {
                    props.onChange?.(valueRef.current)

                    return true
                },
                getMarkdown: () => valueRef.current,
                setMarkdown: (markdown: string) => {
                    valueRef.current = markdown
                    setValue(markdown)
                },
            }))

            return (
                <textarea
                    aria-label="Markdown prompt"
                    data-flush-on-blur={props.flushOnBlur ? 'true' : 'false'}
                    data-has-attachment-handler={props.attachmentHandler ? 'true' : 'false'}
                    data-hide-attachment-control={props.hideAttachmentControl ? 'true' : 'false'}
                    data-image-paste={props.imagePasteHandler ? 'true' : 'false'}
                    data-local-text-search={props.localTextSearch === false ? 'false' : 'true'}
                    data-monospace={props.monospace ? 'true' : 'false'}
                    data-placeholders={props.placeholders?.map(({ name }) => name).join(',')}
                    value={value}
                    onBlur={(event) => props.onChange?.(event.currentTarget.value)}
                    onChange={(event) => {
                        valueRef.current = event.currentTarget.value
                        setValue(event.currentTarget.value)
                        props.draft.edit(event.currentTarget.value)
                        props.onLiveChange?.(event.currentTarget.value)
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return

                        const nextValue = `${valueRef.current}\n`
                        valueRef.current = nextValue
                        setValue(nextValue)
                        props.draft.edit(nextValue)
                        props.onLiveChange?.(nextValue)
                    }}
                    readOnly={props.readOnly}
                />
            )
        }),
    }
})

function mockAvailablePromptHeight(height: number) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        bottom: height,
        height,
        left: 0,
        right: 400,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    })
}

beforeEach(() => window.localStorage.clear())

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('ActionAgentPrompt', () => {
    it('stays read-only during prompt preparation and becomes editable when ready', async () => {
        const promptDraft = new ActionPromptDraft('', true)
        render(<ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} />)
        const prompt = screen.getByLabelText('Markdown prompt')

        expect(prompt).toHaveAttribute('readonly')

        await act(async () => promptDraft.prepare(async () => ({ prompt: 'Prepared prompt' })))

        expect(prompt).not.toHaveAttribute('readonly')
        expect(prompt).toHaveValue('Prepared prompt')
    })

    it('passes card attachment handler to hidden-toolbar prompt editor', () => {
        const promptDraft = new ActionPromptDraft('', false)
        render(
            <ActionAgentPrompt
                attachmentHandler={vi.fn(async () => undefined)}
                convertMessage={null}
                promptDraft={promptDraft}
            />,
        )

        expect(screen.getByLabelText('Markdown prompt')).toHaveAttribute('data-has-attachment-handler', 'true')
        expect(screen.getByLabelText('Markdown prompt')).toHaveAttribute('data-hide-attachment-control', 'true')
    })

    it('configures action placeholders on its hidden-toolbar editor', () => {
        const promptDraft = new ActionPromptDraft('', false)
        render(
            <ActionAgentPrompt
                convertMessage={null}
                promptDraft={promptDraft}
            />,
        )

        expect(screen.getByLabelText('Markdown prompt')).toHaveAttribute(
            'data-placeholders',
            ACTION_PROMPT_PLACEHOLDERS.map(({ name }) => name).join(','),
        )
        expect(screen.getByLabelText('Markdown prompt').getAttribute('data-placeholders')).toContain('this-card')
        expect(screen.getByLabelText('Markdown prompt').getAttribute('data-placeholders')).toContain('active-cards-folder')
        expect(screen.getByLabelText('Markdown prompt').getAttribute('data-placeholders')).toContain('diagram-changes')
        expect(screen.getByLabelText('Markdown prompt')).toHaveAttribute('data-local-text-search', 'false')
        expect(screen.getByLabelText('Markdown prompt')).toHaveAttribute('data-image-paste', 'false')
    })

    it('enables monospace presentation for command editing', () => {
        const promptDraft = new ActionPromptDraft('npm test', false)
        render(<ActionAgentPrompt convertMessage={null} monospace promptDraft={promptDraft} />)

        expect(screen.getByLabelText('Markdown prompt')).toHaveAttribute('data-monospace', 'true')
    })

    it('keeps typing local when prompt loses focus', () => {
        const promptDraft = new ActionPromptDraft('', false)
        render(
            <ActionAgentPrompt
                convertMessage={null}
                promptDraft={promptDraft}
            />,
        )
        const prompt = screen.getByLabelText('Markdown prompt')

        fireEvent.change(prompt, { target: { value: 'Draft' } })

        expect(promptDraft.getSnapshot()).toBe('Draft')
        expect(prompt).toHaveAttribute('data-flush-on-blur', 'true')

        fireEvent.blur(prompt)

        expect(promptDraft.getSnapshot()).toBe('Draft')
    })

    it.each([
        { keyModifier: { ctrlKey: true }, shortcut: 'Ctrl+Enter' },
        { keyModifier: { metaKey: true }, shortcut: 'Meta+Enter' },
    ])('flushes the latest prompt before running $shortcut without passing it to the editor', ({ keyModifier }) => {
        const handleRunShortcut = vi.fn()
        const promptDraft = new ActionPromptDraft('', false)
        render(
            <ActionAgentPrompt
                convertMessage={null}
                onRunShortcut={handleRunShortcut}
                promptDraft={promptDraft}
            />,
        )
        const prompt = screen.getByLabelText('Markdown prompt')

        fireEvent.change(prompt, { target: { value: 'Run this' } })
        fireEvent.keyDown(prompt, { ...keyModifier, key: 'Enter' })

        expect(handleRunShortcut).toHaveBeenCalledOnce()
        expect(promptDraft.getSnapshot()).toBe('Run this')
        expect(prompt).toHaveValue('Run this')
    })

    it('keeps plain Enter and Shift+Enter editor behavior', () => {
        const promptDraft = new ActionPromptDraft('Line', false)
        render(
            <ActionAgentPrompt
                convertMessage={null}
                onRunShortcut={vi.fn()}
                promptDraft={promptDraft}
            />,
        )
        const prompt = screen.getByLabelText('Markdown prompt')

        fireEvent.keyDown(prompt, { key: 'Enter' })
        fireEvent.keyDown(prompt, { key: 'Enter', shiftKey: true })

        expect(promptDraft.getSnapshot()).toBe('Line\n\n')
        expect(prompt).toHaveValue('Line\n\n')
    })

    it('keeps Ctrl+Enter editor behavior when no shortcut callback exists', () => {
        const promptDraft = new ActionPromptDraft('Line', false)
        render(
            <ActionAgentPrompt
                convertMessage={null}
                promptDraft={promptDraft}
            />,
        )
        const prompt = screen.getByLabelText('Markdown prompt')

        fireEvent.keyDown(prompt, { ctrlKey: true, key: 'Enter' })

        expect(promptDraft.getSnapshot()).toBe('Line\n')
        expect(prompt).toHaveValue('Line\n')
    })

    it('applies each external replacement to the mounted editor once', () => {
        const promptDraft = new ActionPromptDraft('Initial', false)
        render(
            <ActionAgentPrompt
                convertMessage={null}
                promptDraft={promptDraft}
            />,
        )
        act(() => promptDraft.replace('Prepared'))

        expect(screen.getByLabelText('Markdown prompt')).toHaveValue('Prepared')
    })

    it.each(['', '   \n\t'])('collapses only the editor region for an empty draft %#', (value) => {
        const promptDraft = new ActionPromptDraft(value, false)
        render(
            <ActionAgentPrompt
                bottomRow={<div>Controls</div>}
                convertMessage={null}
                promptDraft={promptDraft}
                responsePrompts={<div>Predefined phrases</div>}
            />,
        )

        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: 'auto' })
        expect(screen.getByTestId('action-prompt-editor-region')).toHaveStyle({ height: '56px', overflowY: 'auto' })
        expect(screen.getByText('Predefined phrases')).toBeInTheDocument()
        expect(screen.getByText('Controls')).toBeInTheDocument()
    })

    it('disables pointer and keyboard resize while the prompt is empty', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '160')
        const promptDraft = new ActionPromptDraft('', false)
        render(<ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} />)
        const separator = screen.getByRole('separator', { name: 'Resize prompt' })

        expect(separator).toHaveAttribute('aria-disabled', 'true')
        expect(separator).toHaveAttribute('tabindex', '-1')
        fireEvent.pointerDown(separator, { clientY: 200, pointerId: 1 })
        fireEvent.pointerMove(separator, { clientY: 100, pointerId: 1 })
        fireEvent.pointerUp(separator, { clientY: 100, pointerId: 1 })
        fireEvent.keyDown(separator, { key: 'ArrowUp' })

        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: 'auto' })
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('160')
    })

    it('restores the saved height on live text entry and preserves it across empty transitions', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '188')
        mockAvailablePromptHeight(400)
        const promptDraft = new ActionPromptDraft('', false)
        render(<ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} />)
        const prompt = screen.getByLabelText('Markdown prompt')
        const separator = screen.getByRole('separator', { name: 'Resize prompt' })

        fireEvent.change(prompt, { target: { value: 'Plan' } })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '188px' })
        expect(separator).not.toHaveAttribute('aria-disabled')
        expect(separator).toHaveAttribute('tabindex', '0')

        fireEvent.change(prompt, { target: { value: '   ' } })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: 'auto' })
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('188')

        fireEvent.change(prompt, { target: { value: 'Continue' } })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '188px' })
    })

    it('clamps a restored height against the available popup height', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '220')
        mockAvailablePromptHeight(250)
        const promptDraft = new ActionPromptDraft('', false)
        render(<ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} />)

        fireEvent.change(screen.getByLabelText('Markdown prompt'), { target: { value: 'Plan' } })

        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '154px' })
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('154')
    })

    it('persists non-empty pointer and keyboard resize without overwriting it after clearing', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '160')
        mockAvailablePromptHeight(400)
        const promptDraft = new ActionPromptDraft('Plan', false)
        render(<ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} />)
        const separator = screen.getByRole('separator', { name: 'Resize prompt' })

        fireEvent.pointerDown(separator, { clientY: 200, pointerId: 2 })
        fireEvent.pointerMove(separator, { clientY: 160, pointerId: 2 })
        fireEvent.pointerUp(separator, { clientY: 160, pointerId: 2 })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '200px' })
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('200')

        fireEvent.keyDown(separator, { key: 'ArrowDown' })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '176px' })
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('176')

        fireEvent.change(screen.getByLabelText('Markdown prompt'), { target: { value: '' } })
        fireEvent.keyDown(separator, { key: 'ArrowUp' })
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('176')
    })
})

describe('ActionAgentPrompt with a pending question', () => {
    const questionsPanel = <div data-testid="questions-content">Pending question</div>

    it('caps the unsized questions box at 40% of the agent column and scrolls its content', () => {
        mockAvailablePromptHeight(400)
        const promptDraft = new ActionPromptDraft('', false)
        render(
            <ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} questionsPanel={questionsPanel} />,
        )

        expect(screen.getByTestId('questions-content')).toBeInTheDocument()
        expect(screen.getByTestId('action-questions-region')).toHaveStyle({
            maxHeight: '160px',
            overflowY: 'auto',
        })
        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: 'auto' })
    })

    it('keeps the questions box at its 96px floor for a short agent column', () => {
        mockAvailablePromptHeight(120)
        const promptDraft = new ActionPromptDraft('', false)
        render(
            <ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} questionsPanel={questionsPanel} />,
        )

        expect(screen.getByTestId('action-questions-region')).toHaveStyle({ maxHeight: '96px' })
    })

    it('keeps the resize bar active while the prompt is empty', () => {
        mockAvailablePromptHeight(400)
        const promptDraft = new ActionPromptDraft('', false)
        render(
            <ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} questionsPanel={questionsPanel} />,
        )
        const separator = screen.getByRole('separator', { name: 'Resize prompt and questions' })

        expect(separator).not.toHaveAttribute('aria-disabled')
        expect(separator).toHaveAttribute('tabindex', '0')
        expect(separator).toHaveAttribute('aria-valuemin', '168')
    })

    it('resizes the bottom block by drag without rewriting the stored prompt height', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '140')
        window.localStorage.setItem('md2.actionQuestionsBlockHeight', '200')
        mockAvailablePromptHeight(400)
        const promptDraft = new ActionPromptDraft('', false)
        render(
            <ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} questionsPanel={questionsPanel} />,
        )
        const separator = screen.getByRole('separator', { name: 'Resize prompt and questions' })

        fireEvent.pointerDown(separator, { clientY: 200, pointerId: 3 })
        fireEvent.pointerMove(separator, { clientY: 160, pointerId: 3 })
        fireEvent.pointerUp(separator, { clientY: 160, pointerId: 3 })

        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '240px' })
        expect(separator).toHaveAttribute('aria-valuenow', '240')
        expect(window.localStorage.getItem('md2.actionQuestionsBlockHeight')).toBe('240')
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('140')
    })

    it('shrinks the questions box before the prompt and stops both at their floors', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '160')
        window.localStorage.setItem('md2.actionQuestionsBlockHeight', '300')
        mockAvailablePromptHeight(400)
        const promptDraft = new ActionPromptDraft('', false)
        render(
            <ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} questionsPanel={questionsPanel} />,
        )
        const separator = screen.getByRole('separator', { name: 'Resize prompt and questions' })

        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '160px' })

        fireEvent.pointerDown(separator, { clientY: 300, pointerId: 4 })
        fireEvent.pointerMove(separator, { clientY: 344, pointerId: 4 })

        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '256px' })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '160px' })

        fireEvent.pointerMove(separator, { clientY: 400, pointerId: 4 })

        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '200px' })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '104px' })

        fireEvent.pointerMove(separator, { clientY: 900, pointerId: 4 })
        fireEvent.pointerUp(separator, { clientY: 900, pointerId: 4 })

        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '168px' })
        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '72px' })
        expect(window.localStorage.getItem('md2.actionQuestionsBlockHeight')).toBe('168')
    })

    it('stops growing the block once the chat reaches its minimum height', () => {
        window.localStorage.setItem('md2.actionQuestionsBlockHeight', '200')
        mockAvailablePromptHeight(400)
        const promptDraft = new ActionPromptDraft('', false)
        render(
            <ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} questionsPanel={questionsPanel} />,
        )
        const separator = screen.getByRole('separator', { name: 'Resize prompt and questions' })

        fireEvent.pointerDown(separator, { clientY: 300, pointerId: 5 })
        fireEvent.pointerMove(separator, { clientY: -500, pointerId: 5 })
        fireEvent.pointerUp(separator, { clientY: -500, pointerId: 5 })

        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '304px' })
        expect(window.localStorage.getItem('md2.actionQuestionsBlockHeight')).toBe('304')
    })

    it('restores and re-persists the block height through its own storage key', () => {
        window.localStorage.setItem('md2.actionQuestionsBlockHeight', '260')
        mockAvailablePromptHeight(400)
        const promptDraft = new ActionPromptDraft('', false)
        render(
            <ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} questionsPanel={questionsPanel} />,
        )
        const separator = screen.getByRole('separator', { name: 'Resize prompt and questions' })

        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '260px' })

        fireEvent.keyDown(separator, { key: 'ArrowUp' })
        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '284px' })
        expect(window.localStorage.getItem('md2.actionQuestionsBlockHeight')).toBe('284')

        fireEvent.keyDown(separator, { key: 'ArrowDown' })
        expect(screen.getByTestId('action-prompt-block')).toHaveStyle({ height: '260px' })
        expect(window.localStorage.getItem('md2.actionQuestionsBlockHeight')).toBe('260')
    })

    it('leaves the prompt-only bar untouched when no question is pending', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '160')
        mockAvailablePromptHeight(400)
        const promptDraft = new ActionPromptDraft('Plan', false)
        render(<ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} />)
        const separator = screen.getByRole('separator', { name: 'Resize prompt' })

        fireEvent.keyDown(separator, { key: 'ArrowUp' })

        expect(screen.queryByTestId('action-questions-region')).not.toBeInTheDocument()
        expect(separator).toHaveAttribute('aria-valuemin', '72')
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('184')
        expect(window.localStorage.getItem('md2.actionQuestionsBlockHeight')).toBeNull()
    })
})
