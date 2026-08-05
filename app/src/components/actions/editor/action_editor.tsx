import { Box } from '@mui/material'
import { memo, type ReactNode } from 'react'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../../data/action_placeholders'
import type { ActionOpenDocument } from '../../../services/open_files_service'
import { useDialogError } from '../../hooks/use_dialog_error'
import { ActionEditorContent } from './action_editor_content'
import { ActionEditorNavigation } from './action_editor_navigation'
import type { MarkdownDocumentTarget } from '../../editor/markdown_data_source'

export interface ActionEditorProps {
    actionDocument: ActionOpenDocument
    cardTypes: string[]
    discardMarkdownTarget: (target: MarkdownDocumentTarget) => void
    onMarkdownPresentationChange: (presentation: ActionMarkdownPresentation | null) => void
    specialContextTypes: string[]
    states: string[]
}

export interface ActionMarkdownPresentation {
    placeholders?: typeof ACTION_PROMPT_PLACEHOLDERS
    toolbarContents?: () => ReactNode
}

/** Stable layout composed from service-owned editor regions. */
export const ActionEditor = memo(function ActionEditor(props: ActionEditorProps) {
    const {
        actionDocument, cardTypes, discardMarkdownTarget,
        onMarkdownPresentationChange, specialContextTypes, states,
    } = props
    const action = actionDocument.getObject()
    const { sourcePath } = action

    const missingSourceError = !sourcePath
        ? new Error(`Action editor requires a persisted action: ${action.id}`)
        : null
    useDialogError(missingSourceError, 'Action editor is unavailable')

    if (!sourcePath) return null

    return (
        <Box data-testid="action-editor" sx={{ display: 'contents' }}>
            <ActionEditorContent
                action={action}
                cardTypes={cardTypes}
                sourcePath={sourcePath}
                specialContextTypes={specialContextTypes}
                states={states}
            />
            <ActionEditorNavigation
                action={action}
                discardMarkdownTarget={discardMarkdownTarget}
                openDocument={actionDocument}
                onMarkdownPresentationChange={onMarkdownPresentationChange}
                sourcePath={sourcePath}
            />
        </Box>
    )
})
