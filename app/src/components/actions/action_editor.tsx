import { Box } from '@mui/material'
import { memo, type ReactNode } from 'react'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import { ActionEditorContent } from './action_editor_content'
import { ActionEditorNavigation } from './action_editor_navigation'

export interface ActionEditorProps {
    cardTypes: string[]
    discardMarkdownDocument: (documentId: string) => void
    markdownDocumentNamespace: string
    onMarkdownPresentationChange: (presentation: ActionMarkdownPresentation | null) => void
    repositoryFiles: string[]
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
        cardTypes, discardMarkdownDocument, markdownDocumentNamespace,
        onMarkdownPresentationChange, repositoryFiles, specialContextTypes, states,
    } = props

    return (
        <Box data-testid="action-editor" sx={{ display: 'contents' }}>
            <ActionEditorContent
                cardTypes={cardTypes}
                repositoryFiles={repositoryFiles}
                specialContextTypes={specialContextTypes}
                states={states}
            />
            <ActionEditorNavigation
                discardMarkdownDocument={discardMarkdownDocument}
                markdownDocumentNamespace={markdownDocumentNamespace}
                onMarkdownPresentationChange={onMarkdownPresentationChange}
            />
        </Box>
    )
})
