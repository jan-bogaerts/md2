import { Box } from '@mui/material'
import { memo, useCallback, useEffect, useState } from 'react'
import { openFilesService, type OpenDocumentEventDetail } from '../../../services/open_files_service'
import { actionMarkdownDataSource } from '../../editor/action_markdown_data_source'
import { sameMarkdownTarget, type MarkdownDocumentTarget } from '../../editor/markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../../editor/markdown_document_history_store'
import { MarkdownEditor } from '../../editor/markdown_editor'
import { ActionEditor, type ActionMarkdownPresentation } from './action_editor'
import { useOpenFiles } from '../../hooks/use_open_files'
import { actionService } from '../../../services/actions/action_service'
import { useRetainedActionDocument } from './use_retained_action_document'
import { useProjectReadOnly } from '../../hooks/use_project_read_only'

interface ListActionEditorProps {
    cardTypes: string[]
    specialContextTypes: string[]
    states: string[]
}

/** Lifetime-stable list action editor surface and binding-owned undo store. */
export const ListActionEditor = memo(function ListActionEditor(props: ListActionEditorProps) {
    const { cardTypes, specialContextTypes, states } = props
    const readOnly = useProjectReadOnly()
    const { activeDocument } = useOpenFiles()
    const activeActionDocument = activeDocument?.kind === 'action' ? activeDocument : null
    const retainedActionDocument = useRetainedActionDocument()
    const retainedAction = retainedActionDocument?.getObject() ?? null
    const retainedPath = retainedAction?.sourcePath
    const actionExists = !!retainedPath && (
        !!actionService.getActionByPath(retainedPath)
        || actionService.draftStore.getDeletedDraftActions().some((candidate) => candidate.sourcePath === retainedPath)
    )
    const action = actionExists ? retainedAction : null
    const [historyStore] = useState(() => new MarkdownDocumentHistoryStore())
    const [presentation, setPresentation] = useState<ActionMarkdownPresentation | null>(null)

    const discardMarkdownTarget = useCallback((target: MarkdownDocumentTarget) => {
        historyStore.discardTarget(target)
        const activeTarget = actionMarkdownDataSource.getActiveTarget('list-action')
        if (sameMarkdownTarget(activeTarget, target)) actionMarkdownDataSource.setActiveActionTarget(null, true)
    }, [historyStore])

    useEffect(() => {
        const handleRemoved = (event: Event) => {
            const { document } = (event as CustomEvent<OpenDocumentEventDetail>).detail
            if (document.kind !== 'action') return

            historyStore.discardDocument(document)
            const activeTarget = actionMarkdownDataSource.getActiveTarget('list-action')
            if (activeTarget?.document === document) {
                actionMarkdownDataSource.setActiveActionTarget(null)
                setPresentation(null)
            }
        }
        openFilesService.addEventListener('removed', handleRemoved)

        return () => openFilesService.removeEventListener('removed', handleRemoved)
    }, [historyStore])

    useEffect(() => () => actionMarkdownDataSource.setActiveActionTarget(null), [])

    return (
        <Box
            data-testid="list-action-editor"
            hidden={!activeActionDocument}
            sx={{ display: activeActionDocument ? 'contents' : 'none' }}
        >
            {action && retainedActionDocument ? (
                <ActionEditor
                    actionDocument={retainedActionDocument}
                    cardTypes={cardTypes}
                    discardMarkdownTarget={discardMarkdownTarget}
                    onMarkdownPresentationChange={setPresentation}
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
                    readOnly={readOnly}
                    toolbarContents={readOnly ? undefined : presentation?.toolbarContents}
                />
            </Box>
        </Box>
    )
})
