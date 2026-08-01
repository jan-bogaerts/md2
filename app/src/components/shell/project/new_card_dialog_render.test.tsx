import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ChangeEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, DEFAULT_STATES } from '../../../data/data_types'
import type { MarkdownEditorHandle } from '../../editor/markdown_editor'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { NewCardDialog } from './new_card_dialog'

const { editorBoundaryRender } = vi.hoisted(() => ({ editorBoundaryRender: vi.fn() }))

vi.mock('./new_card_markdown_editor', async () => {
    const { forwardRef, useImperativeHandle, useRef } = await import('react')

    interface EditorProps {
        onDirtyChange: (dirty: boolean) => void
    }

    const NewCardMarkdownEditor = forwardRef<MarkdownEditorHandle, EditorProps>(function NewCardMarkdownEditor(props, ref) {
        const editorRef = useRef<HTMLTextAreaElement>(null)
        editorBoundaryRender()
        useImperativeHandle(ref, () => ({
            flush: () => true,
            getMarkdown: () => editorRef.current?.value ?? '',
            setMarkdown: (markdown: string) => {
                if (editorRef.current) editorRef.current.value = markdown
            },
        }), [])

        const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
            props.onDirtyChange(event.currentTarget.value.length > 0)
        }

        return <textarea aria-label="Draft body" onChange={handleChange} ref={editorRef} />
    })

    return { NewCardMarkdownEditor }
})

describe('NewCardDialog editor render boundary', () => {
    it('does not rerender the editor boundary for repeated description edits', () => {
        window.matchMedia = ((query: string) => ({
            addEventListener: () => {},
            addListener: () => {},
            dispatchEvent: () => false,
            matches: false,
            media: query,
            onchange: null,
            removeEventListener: () => {},
            removeListener: () => {},
        })) as unknown as typeof window.matchMedia

        render(
            <NewCardDialog
                cardBodyTemplate=""
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={vi.fn(async () => undefined)}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        const description = within(screen.getByRole('group', { name: 'Description' })).getByRole('textbox')
        const initialRenderCount = editorBoundaryRender.mock.calls.length
        fireEvent.change(description, { target: { value: 'One' } })
        fireEvent.change(description, { target: { value: 'One two' } })
        fireEvent.change(description, { target: { value: 'One two three' } })

        expect(editorBoundaryRender).toHaveBeenCalledTimes(initialRenderCount)
    })
})
