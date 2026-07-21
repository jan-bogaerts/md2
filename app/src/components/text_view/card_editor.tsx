import { Box } from '@mui/material'
import { memo, useCallback, useEffect, useState } from 'react'
import type { CardTypeConfig } from '../../data/data_types'
import { ListCardCommitDiffPanel } from '../card_view/list_card_commit_diff_panel'
import { cardMarkdownDataSource, type CardDocumentClosedDetail } from '../editor/card_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownEditor } from '../editor/markdown_editor'
import { MarkdownEditorStateStore } from '../editor/markdown_editor_state_store'
import { ListEditorToolbarControls } from './list_editor_toolbar_controls'

interface CardEditorProps {
    cardTypes: CardTypeConfig[]
    statusColors: Map<string, string>
    visible: boolean
}

/** Lifetime-stable list-card editor with private history. */
export const CardEditor = memo(function CardEditor(props: CardEditorProps) {
    const { cardTypes, statusColors, visible } = props
    const [historyStore] = useState(() => new MarkdownDocumentHistoryStore())
    const [stateStore] = useState(() => new MarkdownEditorStateStore())

    useEffect(() => {
        const handleCardDocumentClosed = (event: Event) => {
            const { binding, documentId } = (event as CustomEvent<CardDocumentClosedDetail>).detail
            if (binding !== 'list-card') return

            historyStore.discardDocument(documentId)
        }
        cardMarkdownDataSource.addEventListener('cardDocumentClosed', handleCardDocumentClosed)

        return () => {
            cardMarkdownDataSource.removeEventListener('cardDocumentClosed', handleCardDocumentClosed)
        }
    }, [historyStore])

    const toolbarContents = useCallback(() => (
        <ListEditorToolbarControls
            cardTypes={cardTypes}
            historyStore={historyStore}
            statusColors={statusColors}
            visible={visible}
        />
    ), [cardTypes, historyStore, statusColors, visible])

    return (
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            <ListCardCommitDiffPanel>
                <MarkdownEditor
                    binding="list-card"
                    dataSource={cardMarkdownDataSource}
                    historyStore={historyStore}
                    stateStore={stateStore}
                    stickyToolbar
                    toolbarContents={toolbarContents}
                />
            </ListCardCommitDiffPanel>
        </Box>
    )
})
