import { Box } from '@mui/material'
import { memo, useCallback, useEffect, useState } from 'react'
import type { CardTypeConfig } from '../../data/data_types'
import { ListCardCommitDiffPanel } from '../card_view/list_card_commit_diff_panel'
import { cardMarkdownDataSource, type CardDocumentClosedDetail } from '../editor/card_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownEditor } from '../editor/markdown_editor'
import { ListEditorToolbarControls } from './list_editor_toolbar_controls'

interface CardEditorProps {
    cardTypes: CardTypeConfig[]
    statusColors: Map<string, string>
}

/** Lifetime-stable list-card editor with private history. */
export const CardEditor = memo(function CardEditor(props: CardEditorProps) {
    const { cardTypes, statusColors } = props
    const [historyStore] = useState(() => new MarkdownDocumentHistoryStore())

    useEffect(() => {
        const handleCardDocumentClosed = (event: Event) => {
            const { binding, document } = (event as CustomEvent<CardDocumentClosedDetail>).detail
            if (binding !== 'list-card') return

            historyStore.discardDocument(document)
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
        />
    ), [cardTypes, historyStore, statusColors])

    return (
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            <ListCardCommitDiffPanel>
                <MarkdownEditor
                    binding="list-card"
                    dataSource={cardMarkdownDataSource}
                    historyStore={historyStore}
                    toolbarContents={toolbarContents}
                />
            </ListCardCommitDiffPanel>
        </Box>
    )
})
