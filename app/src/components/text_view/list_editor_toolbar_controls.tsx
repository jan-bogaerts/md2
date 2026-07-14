import { Badge, Button } from '@mui/material'
import { Separator } from '@mdxeditor/editor'
import { MarkdownFormatToolbarControls } from '../editor/markdown_format_toolbar_controls'

interface ListEditorToolbarControlsProps {
    conversationCount: number
    isConversationPanelOpen: boolean
    onToggleConversationPanel: () => void
}

/** Formatting controls and the agent-panel toggle for the list-view editor. */
export function ListEditorToolbarControls(props: ListEditorToolbarControlsProps) {
    const { conversationCount, isConversationPanelOpen, onToggleConversationPanel } = props
    const agentControl = (
        <>
            <Separator />
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

    return <MarkdownFormatToolbarControls endControls={agentControl} />
}
