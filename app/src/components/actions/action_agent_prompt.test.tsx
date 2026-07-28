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

    it('flushes the latest prompt before running the keyboard shortcut', () => {
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
        fireEvent.keyDown(prompt, { ctrlKey: true, key: 'Enter' })

        expect(handlePromptChange).toHaveBeenCalledWith('Run this')
        expect(handlePromptChange.mock.invocationCallOrder[0]).toBeLessThan(handleRunShortcut.mock.invocationCallOrder[0])
    })
})
