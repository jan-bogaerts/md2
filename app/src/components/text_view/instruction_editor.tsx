import { Box } from '@mui/material'
import { memo, useState } from 'react'
import { instructionMarkdownDataSource } from '../editor/instruction_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownEditor } from '../editor/markdown_editor'
import { useProjectReadOnly } from '../hooks/use_project_read_only'

/** Lifetime-stable editor for Markdown and text instruction documents. */
export const InstructionEditor = memo(function InstructionEditor() {
    const readOnly = useProjectReadOnly()
    const [historyStore] = useState(() => new MarkdownDocumentHistoryStore())

    return (
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            <MarkdownEditor
                binding="list-instruction"
                dataSource={instructionMarkdownDataSource}
                historyStore={historyStore}
                readOnly={readOnly}
            />
        </Box>
    )
})
