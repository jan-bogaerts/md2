import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionAgentPrompt } from './action_agent_prompt'
import { ActionPromptDraft } from '../../services/actions/action_prompt_draft_service'

const setMarkdown = vi.hoisted(() => vi.fn())

vi.mock('../editor/markdown_editor', async () => {
    const { forwardRef, useImperativeHandle, useRef, useState } = await import('react')

    return {
        MarkdownEditor: forwardRef(function MarkdownEditorMock(props: {
            flushOnBlur?: boolean
            markdown: string
            onChange: (markdown: string) => void
            onLiveChange?: (markdown: string) => void
            readOnly?: boolean
        }, ref) {
            const valueRef = useRef(props.markdown)
            const [value, setValue] = useState(props.markdown)
            useImperativeHandle(ref, () => ({
                flush: () => {
                    props.onChange(valueRef.current)

                    return true
                },
                getMarkdown: () => valueRef.current,
                setMarkdown: (markdown: string) => {
                    valueRef.current = markdown
                    setValue(markdown)
                    setMarkdown(markdown)
                },
            }))

            return (
                <textarea
                    aria-label="Markdown prompt"
                    data-flush-on-blur={props.flushOnBlur ? 'true' : 'false'}
                    value={value}
                    onBlur={(event) => props.onChange(event.currentTarget.value)}
                    onChange={(event) => {
                        valueRef.current = event.currentTarget.value
                        setValue(event.currentTarget.value)
                        props.onLiveChange?.(event.currentTarget.value)
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return

                        const nextValue = `${valueRef.current}\n`
                        valueRef.current = nextValue
                        setValue(nextValue)
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
    it('keeps typing local and synchronizes the prompt on blur', () => {
        const promptDraft = new ActionPromptDraft('', false, null)
        const synchronize = vi.spyOn(promptDraft, 'synchronize')
        render(
            <ActionAgentPrompt
                convertMessage={null}
                disabled={false}
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
                disabled={false}
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
                disabled={false}
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
                disabled={false}
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
                disabled={false}
                promptDraft={promptDraft}
            />,
        )
        setMarkdown.mockClear()

        act(() => promptDraft.replace('Prepared'))

        expect(setMarkdown).toHaveBeenCalledOnce()
        expect(setMarkdown).toHaveBeenCalledWith('Prepared')
        expect(screen.getByLabelText('Markdown prompt')).toHaveValue('Prepared')
    })
})
