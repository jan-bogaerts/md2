import { Box } from '@mui/material'
import { memo, type ReactNode } from 'react'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import { ActionEditorContent } from './action_editor_content'
import { ActionEditorNavigation } from './action_editor_navigation'
import type { MarkdownDocumentTarget } from '../editor/markdown_data_source'

export interface ActionEditorProps {
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
        cardTypes, discardMarkdownTarget,
        onMarkdownPresentationChange, specialContextTypes, states,
    } = props

    return (
        <Box data-testid="action-editor" sx={{ display: 'contents' }}>
            <ActionEditorContent
                cardTypes={cardTypes}
                specialContextTypes={specialContextTypes}
                states={states}
            />
            <ActionEditorNavigation
                discardMarkdownTarget={discardMarkdownTarget}
                onMarkdownPresentationChange={onMarkdownPresentationChange}
            />
        </Box>
    )
})
