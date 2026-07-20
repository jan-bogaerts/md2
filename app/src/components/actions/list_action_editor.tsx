import { Box } from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import type { ActionDefinition } from '../../data/action_types'
import { openFilesService, type OpenDocumentEventDetail } from '../../services/open_files_service'
import {
    actionMarkdownDataSource,
    actionMarkdownDocumentId,
    parseActionMarkdownDocumentId,
} from '../editor/action_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownEditor } from '../editor/markdown_editor'
import { MarkdownEditorStateStore } from '../editor/markdown_editor_state_store'
import { ActionEditor, type ActionMarkdownPresentation } from './action_editor'

interface ListActionEditorProps {
    action: ActionDefinition | null
    actions: ActionDefinition[]
    cardTypes: string[]
    markdownDocumentNamespace: string
    repositoryFiles: string[]
    specialContextTypes: string[]
    states: string[]
}

/** Lifetime-stable list action editor surface and binding-owned undo store. */
export function ListActionEditor(props: ListActionEditorProps) {
    const { action, actions, cardTypes, markdownDocumentNamespace, repositoryFiles, specialContextTypes, states } = props
    const [historyStore] = useState(() => new MarkdownDocumentHistoryStore())
    const [stateStore] = useState(() => new MarkdownEditorStateStore())
    const [presentation, setPresentation] = useState<ActionMarkdownPresentation | null>(null)

    const discardMarkdownDocument = useCallback((documentId: string) => {
        actionMarkdownDataSource.forgetDocument(documentId)
        historyStore.discardDocument(documentId)
    }, [historyStore])

    useEffect(() => {
        const handleRemoved = (event: Event) => {
            const { document } = (event as CustomEvent<OpenDocumentEventDetail>).detail
            if (document.kind !== 'action') return

            const removedAction = document.getObject() as ActionDefinition
            for (const { identity } of removedAction.editorState?.phrases ?? []) {
                discardMarkdownDocument(actionMarkdownDocumentId(markdownDocumentNamespace, removedAction.id, identity))
            }
            discardMarkdownDocument(actionMarkdownDocumentId(markdownDocumentNamespace, removedAction.id, 'prompt'))
            const activeDocumentId = actionMarkdownDataSource.getActiveDocumentId('list-action')
            if (activeDocumentId && parseActionMarkdownDocumentId(activeDocumentId).actionId === removedAction.id) {
                actionMarkdownDataSource.setActiveDocument('list-action', null)
                setPresentation(null)
            }
        }
        openFilesService.addEventListener('removed', handleRemoved)

        return () => openFilesService.removeEventListener('removed', handleRemoved)
    }, [discardMarkdownDocument, markdownDocumentNamespace])

    useEffect(() => () => actionMarkdownDataSource.setActiveDocument('list-action', null), [])

    return (
        <Box data-testid="list-action-editor" sx={{ display: 'contents' }}>
            {action ? (
                <ActionEditor
                    action={action}
                    actions={actions}
                    cardTypes={cardTypes}
                    discardMarkdownDocument={discardMarkdownDocument}
                    markdownDocumentNamespace={markdownDocumentNamespace}
                    onMarkdownPresentationChange={setPresentation}
                    repositoryFiles={repositoryFiles}
                    specialContextTypes={specialContextTypes}
                    states={states}
                />
            ) : null}
            <Box hidden={!presentation} sx={{ flex: 1, minHeight: 0, order: 1, overflowY: 'auto' }}>
                <MarkdownEditor
                    binding="list-action"
                    dataSource={actionMarkdownDataSource}
                    flushOnBlur
                    historyStore={historyStore}
                    placeholders={presentation?.placeholders}
                    stateStore={stateStore}
                    toolbarContents={presentation?.toolbarContents}
                />
            </Box>
        </Box>
    )
}
