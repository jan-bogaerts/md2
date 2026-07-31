import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionAgentPrompt } from './action_agent_prompt'
import { ActionPromptDraft } from './action_prompt_draft'

vi.mock('../editor/markdown_editor', async () => {
    const { forwardRef, useImperativeHandle, useRef } = await import('react')

    return {
        MarkdownEditor: forwardRef(function MarkdownEditorMock(props: {
            flushOnBlur?: boolean
            markdown: string
            onChange: (markdown: string) => void
            onLiveChange?: (markdown: string) => void
            readOnly?: boolean
        }, ref) {
            const valueRef = useRef(props.markdown)
            useImperativeHandle(ref, () => ({
                flush: () => {
                    props.onChange(valueRef.current)

                    return true
                },
                getMarkdown: () => valueRef.current,
                setMarkdown: (markdown: string) => {
                    valueRef.current = markdown
                },
            }))

            return (
                <textarea
                    aria-label="Markdown prompt"
                    data-flush-on-blur={props.flushOnBlur ? 'true' : 'false'}
                    defaultValue={props.markdown}
                    onBlur={(event) => props.onChange(event.currentTarget.value)}
                    onChange={(event) => {
                        valueRef.current = event.currentTarget.value
                        props.onLiveChange?.(event.currentTarget.value)
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return

                        const nextValue = `${valueRef.current}\n`
                        valueRef.current = nextValue
                        event.currentTarget.value = nextValue
                        props.onLiveChange?.(nextValue)
                    }}
                    readOnly={props.readOnly}
                />
            )
        }),
    }
})

afterEach(cleanup)

describe('ActionAgentPrompt', () => {
    it('keeps typing local and reports the prompt on blur', () => {
        const handlePromptChange = vi.fn()
        const promptDraft = new ActionPromptDraft('')
        render(
            <ActionAgentPrompt
                convertMessage={null}
                disabled={false}
                onPromptChange={handlePromptChange}
                promptDraft={promptDraft}
                promptFailed={false}
                promptLoading={false}
            />,
        )
        const prompt = screen.getByLabelText('Markdown prompt')

        fireEvent.change(prompt, { target: { value: 'Draft' } })

        expect(handlePromptChange).not.toHaveBeenCalled()
        expect(promptDraft.getSnapshot()).toBe('Draft')
        expect(prompt).toHaveAttribute('data-flush-on-blur', 'true')

        fireEvent.blur(prompt)

        expect(handlePromptChange).toHaveBeenCalledWith('Draft')
    })

    it.each([
        { keyModifier: { ctrlKey: true }, shortcut: 'Ctrl+Enter' },
        { keyModifier: { metaKey: true }, shortcut: 'Meta+Enter' },
    ])('flushes the latest prompt before running $shortcut without passing it to the editor', ({ keyModifier }) => {
        const handlePromptChange = vi.fn()
        const handleRunShortcut = vi.fn()
        const promptDraft = new ActionPromptDraft('')
        render(
            <ActionAgentPrompt
                convertMessage={null}
                disabled={false}
                onPromptChange={handlePromptChange}
                onRunShortcut={handleRunShortcut}
                promptDraft={promptDraft}
                promptFailed={false}
                promptLoading={false}
            />,
        )
        const prompt = screen.getByLabelText('Markdown prompt')

        fireEvent.change(prompt, { target: { value: 'Run this' } })
        fireEvent.keyDown(prompt, { ...keyModifier, key: 'Enter' })

        expect(handlePromptChange).toHaveBeenCalledWith('Run this')
        expect(handlePromptChange.mock.invocationCallOrder[0]).toBeLessThan(handleRunShortcut.mock.invocationCallOrder[0])
        expect(handleRunShortcut).toHaveBeenCalledOnce()
        expect(promptDraft.getSnapshot()).toBe('Run this')
        expect(prompt).toHaveValue('Run this')
    })

    it('keeps plain Enter and Shift+Enter editor behavior', () => {
        const promptDraft = new ActionPromptDraft('Line')
        render(
            <ActionAgentPrompt
                convertMessage={null}
                disabled={false}
                onPromptChange={vi.fn()}
                onRunShortcut={vi.fn()}
                promptDraft={promptDraft}
                promptFailed={false}
                promptLoading={false}
            />,
        )
        const prompt = screen.getByLabelText('Markdown prompt')

        fireEvent.keyDown(prompt, { key: 'Enter' })
        fireEvent.keyDown(prompt, { key: 'Enter', shiftKey: true })

        expect(promptDraft.getSnapshot()).toBe('Line\n\n')
        expect(prompt).toHaveValue('Line\n\n')
    })

    it('keeps Ctrl+Enter editor behavior when no shortcut callback exists', () => {
        const promptDraft = new ActionPromptDraft('Line')
        render(
            <ActionAgentPrompt
                convertMessage={null}
                disabled={false}
                onPromptChange={vi.fn()}
                promptDraft={promptDraft}
                promptFailed={false}
                promptLoading={false}
            />,
        )
        const prompt = screen.getByLabelText('Markdown prompt')

        fireEvent.keyDown(prompt, { ctrlKey: true, key: 'Enter' })

        expect(promptDraft.getSnapshot()).toBe('Line\n')
        expect(prompt).toHaveValue('Line\n')
    })
})
