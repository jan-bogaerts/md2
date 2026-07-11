import { Box } from '@mui/material'
import { useCallback } from 'react'
import type { ProjectCard } from '../../data/data_types'
import { MarkdownEditor } from '../editor/markdown_editor'
import { CardPopupToolbarControls } from './card_popup_toolbar_controls'

interface CardBodyEditorProps {
    card: ProjectCard
    isMobile?: boolean
    isFullscreen: boolean
    onBodyChange: (path: string, body: string) => void
    onToggleFullscreen: () => void
}

/**
 * Body editing surface for a card. Renders the shared markdown editor (F-007);
 * edits flow up as markdown through `onBodyChange`, and `DataService` preserves
 * the frontmatter/header block via the shared parsing service.
 */
export function CardBodyEditor(props: CardBodyEditorProps) {
    const { card, isFullscreen, isMobile = false, onBodyChange, onToggleFullscreen } = props
    const ToolbarContents = useCallback(
        () => <CardPopupToolbarControls isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />,
        [isFullscreen, onToggleFullscreen],
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
                    top: isMobile ? 0 : 'auto',
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
                key={card.path}
                markdown={card.content}
                onChange={(body) => onBodyChange(card.path, body)}
                stickyToolbar={isMobile}
                toolbarContents={ToolbarContents}
            />
        </Box>
    )
}
