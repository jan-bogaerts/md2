import { Box } from '@mui/material'
import { memo, useCallback } from 'react'
import type { CardTypeConfig } from '../../data/data_types'
import { MarkdownEditor } from '../editor/markdown_editor'
import type { CardMarkdownDataSource } from '../editor/card_markdown_data_source'
import type { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { CardPopupToolbarControls } from './card_popup_toolbar_controls'
import { useProjectReadOnly } from '../hooks/use_project_read_only'

interface CardBodyEditorProps {
    cardTypes: CardTypeConfig[]
    dataSource: CardMarkdownDataSource
    historyStore: MarkdownDocumentHistoryStore
    isMobile?: boolean
    isFullscreen: boolean
    onToggleFullscreen: () => void
    overlayContainer?: HTMLElement | null
    statusColors: Map<string, string>
}

/**
 * Body editing surface for a card, bound directly to the card Markdown data source.
 */
export const CardBodyEditor = memo(function CardBodyEditor(props: CardBodyEditorProps) {
    const {cardTypes, dataSource, historyStore, isFullscreen, isMobile = false, onToggleFullscreen, overlayContainer, statusColors} = props
    const readOnly = useProjectReadOnly()
    const handleImagePaste = useCallback(
        (file: File, insertMarkdown: (markdown: string) => void) => dataSource.pasteImage('board-card', file, insertMarkdown),
        [dataSource],
    )
    const ToolbarContents = useCallback(
        () => (
            <CardPopupToolbarControls
                cardTypes={cardTypes}
                dataSource={dataSource}
                isFullscreen={isFullscreen}
                isMobile={isMobile}
                onToggleFullscreen={onToggleFullscreen}
                readOnly={readOnly}
                statusColors={statusColors}
            />
        ),
        [cardTypes, dataSource, isFullscreen, isMobile, onToggleFullscreen, readOnly, statusColors],
    )
    return (
        <Box
            sx={{
                '& .mdxeditor-content': {
                    boxSizing: 'border-box',
                    minHeight: 220,
                    padding: '26px 28px 32px',
                },
                '& [class*="_toolbarButton_"], & [class*="_toolbarToggleItem_"]': {
                    alignItems: 'center',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    height: 30,
                    justifyContent: 'center',
                    width: 30,
                },
                '& [class*="_toolbarButton_"]:hover, & [class*="_toolbarToggleItem_"]:hover': {
                    backgroundColor: 'background.paper',
                    color: 'text.primary',
                },
                '& [class*="_toolbarRoot_"]': {
                    backgroundColor: 'action.selected',
                    borderRadius: '9px',
                    boxSizing: 'border-box',
                    color: 'text.secondary',
                    flexShrink: 0,
                    height: 40,
                    margin: '14px 20px 0',
                    padding: '0 6px',
                    width: 'auto',
                },
                '& [class*="_toolbarRoot_"] div[role="separator"]': {
                    borderColor: 'divider',
                    height: 20,
                    margin: '0 4px',
                },
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
            }}
        >
            <MarkdownEditor
                binding="board-card"
                dataSource={dataSource}
                historyStore={historyStore}
                imagePasteHandler={handleImagePaste}
                overlayContainer={overlayContainer}
                readOnly={readOnly}
                toolbarContents={ToolbarContents}
            />
        </Box>
    )
})
