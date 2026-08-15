import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionAgentPrompt } from './action_agent_prompt'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../../data/action_placeholders'
import { ActionPromptDraft } from '../../../services/actions/action_prompt_draft_service'
import type { MarkdownDraft } from '../../../services/markdown/markdown_draft'

vi.mock('../../editor/markdown_editor', async () => {
    const { forwardRef, useEffect, useImperativeHandle, useRef, useState } = await import('react')

    return {
        MarkdownEditor: forwardRef(function MarkdownEditorMock(props: {
            attachmentHandler?: (files: File[], insertMarkdown: (markdown: string) => void) => Promise<void>
            draft: MarkdownDraft
            flushOnBlur?: boolean
            hideAttachmentControl?: boolean
            imagePasteHandler?: (file: File, insertMarkdown: (markdown: string) => void) => Promise<void>
            localTextSearch?: boolean
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
        const promptDraft = new ActionPromptDraft('', true, null)
        render(<ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} />)
        const prompt = screen.getByLabelText('Markdown prompt')

        expect(prompt).toHaveAttribute('readonly')

        await act(async () => promptDraft.prepare(async () => 'Prepared prompt'))

        expect(prompt).not.toHaveAttribute('readonly')
        expect(prompt).toHaveValue('Prepared prompt')
    })

    it('passes card attachment handler to hidden-toolbar prompt editor', () => {
        const promptDraft = new ActionPromptDraft('', false, null)
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
        const promptDraft = new ActionPromptDraft('', false, null)
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
        expect(screen.getByLabelText('Markdown prompt')).toHaveAttribute('data-local-text-search', 'false')
        expect(screen.getByLabelText('Markdown prompt')).toHaveAttribute('data-image-paste', 'false')
    })

    it('keeps typing local and synchronizes the prompt on blur', () => {
        const promptDraft = new ActionPromptDraft('', false, null)
        const synchronize = vi.spyOn(promptDraft, 'synchronize')
        render(
            <ActionAgentPrompt
                convertMessage={null}
                promptDraft={promptDraft}
            />,
        )
        const prompt = screen.getByLabelText('Markdown prompt')

        fireEvent.change(prompt, { target: { value: 'Draft' } })

        expect(synchronize).not.toHaveBeenCalled()
        expect(promptDraft.getSnapshot()).toBe('Draft')
        expect(prompt).toHaveAttribute('data-flush-on-blur', 'true')

        fireEvent.blur(prompt)

        expect(synchronize).toHaveBeenCalledOnce()
    })

    it.each([
        { keyModifier: { ctrlKey: true }, shortcut: 'Ctrl+Enter' },
        { keyModifier: { metaKey: true }, shortcut: 'Meta+Enter' },
    ])('flushes the latest prompt before running $shortcut without passing it to the editor', ({ keyModifier }) => {
        const handleRunShortcut = vi.fn()
        const promptDraft = new ActionPromptDraft('', false, null)
        const synchronize = vi.spyOn(promptDraft, 'synchronize')
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

        expect(synchronize).toHaveBeenCalledOnce()
        expect(synchronize.mock.invocationCallOrder[0]).toBeLessThan(handleRunShortcut.mock.invocationCallOrder[0])
        expect(handleRunShortcut).toHaveBeenCalledOnce()
        expect(promptDraft.getSnapshot()).toBe('Run this')
        expect(prompt).toHaveValue('Run this')
    })

    it('keeps plain Enter and Shift+Enter editor behavior', () => {
        const promptDraft = new ActionPromptDraft('Line', false, null)
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
        const promptDraft = new ActionPromptDraft('Line', false, null)
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
        const promptDraft = new ActionPromptDraft('Initial', false, null)
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
        const promptDraft = new ActionPromptDraft(value, false, null)
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
        const promptDraft = new ActionPromptDraft('', false, null)
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
        const promptDraft = new ActionPromptDraft('', false, null)
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
        const promptDraft = new ActionPromptDraft('', false, null)
        render(<ActionAgentPrompt convertMessage={null} promptDraft={promptDraft} />)

        fireEvent.change(screen.getByLabelText('Markdown prompt'), { target: { value: 'Plan' } })

        expect(screen.getByLabelText('Prompt')).toHaveStyle({ height: '154px' })
        expect(window.localStorage.getItem('md2.actionPromptHeight')).toBe('154')
    })

    it('persists non-empty pointer and keyboard resize without overwriting it after clearing', () => {
        window.localStorage.setItem('md2.actionPromptHeight', '160')
        mockAvailablePromptHeight(400)
        const promptDraft = new ActionPromptDraft('Plan', false, null)
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
