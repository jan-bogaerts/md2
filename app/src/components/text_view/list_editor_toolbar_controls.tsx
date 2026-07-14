import { Badge, Button } from '@mui/material'
import { Separator } from '@mdxeditor/editor'
import type { MouseEvent } from 'react'
import { MarkdownFormatToolbarControls } from '../editor/markdown_format_toolbar_controls'

interface ListEditorToolbarControlsProps {
    conversationCount: number
    isConversationPanelOpen: boolean
    isPropertiesOpen: boolean
    onOpenProperties: (event: MouseEvent<HTMLElement>) => void
    onToggleConversationPanel: () => void
    propertiesAvailable: boolean
}

/** Formatting controls and the agent-panel toggle for the list-view editor. */
export function ListEditorToolbarControls(props: ListEditorToolbarControlsProps) {
    const {
        conversationCount, isConversationPanelOpen, isPropertiesOpen,
        onOpenProperties, onToggleConversationPanel, propertiesAvailable,
    } = props
    const endControls = (
        <>
            <Separator />
            {propertiesAvailable ? (
                <Button
                    aria-haspopup="dialog"
                    onClick={onOpenProperties}
                    size="small"
                    variant={isPropertiesOpen ? 'contained' : 'outlined'}
                >
                    Properties
                </Button>
            ) : null}
            <Button
                onClick={onToggleConversationPanel}
                size="small"
                variant={isConversationPanelOpen ? 'contained' : 'outlined'}
            >
                <Badge badgeContent={conversationCount} color="primary" sx={{ mr: 1 }}>
                    Agents
                </Badge>
            </Button>
        </>
    )

    return <MarkdownFormatToolbarControls endControls={endControls} />
}
