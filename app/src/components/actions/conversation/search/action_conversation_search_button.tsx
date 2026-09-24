import SearchOutlined from '@mui/icons-material/SearchOutlined'
import { IconButton, Tooltip } from '@mui/material'
import { useSyncExternalStore } from 'react'
import type { ActionConversationSearchService } from './action_conversation_search_service'

interface ActionConversationSearchButtonProps {
    service: ActionConversationSearchService
}

/** Opens visible-text search for mounted conversation transcript. */
export function ActionConversationSearchButton({ service }: ActionConversationSearchButtonProps) {
    const transcriptMounted = useSyncExternalStore(
        service.subscribeTranscriptMounted,
        service.getTranscriptMounted,
        service.getTranscriptMounted,
    )

    const handleOpen = () => {
        service.openSearch()
    }

    return (
        <Tooltip title="Find in conversation">
            <span>
                <IconButton
                    aria-label="Find in conversation"
                    disabled={!transcriptMounted}
                    onClick={handleOpen}
                    size="small"
                    sx={{ flexShrink: 0, height: 30, width: 30 }}
                >
                    <SearchOutlined sx={{ fontSize: 18 }} />
                </IconButton>
            </span>
        </Tooltip>
    )
}
