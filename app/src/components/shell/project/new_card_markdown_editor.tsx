import { memo, forwardRef } from 'react'
import { MarkdownEditor, type MarkdownEditorHandle } from '../../editor/markdown_editor'

interface NewCardMarkdownEditorProps {
    onDirtyChange: (dirty: boolean) => void
}

const handleChange = () => undefined

/** Lifetime-stable Markdown editor boundary for a new-card draft. */
export const NewCardMarkdownEditor = memo(forwardRef<MarkdownEditorHandle, NewCardMarkdownEditorProps>(
    function NewCardMarkdownEditor(props, ref) {
        const { onDirtyChange } = props

        return (
            <MarkdownEditor
                hideToolbar
                markdown=""
                onChange={handleChange}
                onDirtyChange={onDirtyChange}
                ref={ref}
            />
        )
    },
))
