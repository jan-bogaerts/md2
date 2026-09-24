import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined'
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined'
import SearchOutlined from '@mui/icons-material/SearchOutlined'
import { Box, IconButton, InputAdornment, TextField, ToggleButton, Tooltip, Typography } from '@mui/material'
import { useSyncExternalStore, type ChangeEvent, type KeyboardEvent } from 'react'
import type { ActionConversationSearchService } from './action_conversation_search_service'

interface ActionConversationSearchRowProps {
    service: ActionConversationSearchService
}

/** Fixed-header controls for conversation-local visible-text search. */
export function ActionConversationSearchRow({ service }: ActionConversationSearchRowProps) {
    const open = useSyncExternalStore(service.subscribeOpen, service.getOpen, service.getOpen)
    const draftTerm = useSyncExternalStore(service.subscribeDraftTerm, service.getDraftTerm, service.getDraftTerm)
    const submittedTerm = useSyncExternalStore(
        service.subscribeSubmittedTerm,
        service.getSubmittedTerm,
        service.getSubmittedTerm,
    )
    const caseSensitive = useSyncExternalStore(
        service.subscribeCaseSensitive,
        service.getCaseSensitive,
        service.getCaseSensitive,
    )
    const resultCount = useSyncExternalStore(
        service.subscribeResultCount,
        service.getResultCount,
        service.getResultCount,
    )
    useSyncExternalStore(service.subscribeActiveMatch, service.getActiveMatchIndex, service.getActiveMatchIndex)
    if (!open) return null

    const handleTermChange = (event: ChangeEvent<HTMLInputElement>) => {
        service.setDraftTerm(event.target.value)
    }
    const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return

        event.preventDefault()
        service.submitSearch()
    }
    const handleSubmit = () => {
        service.submitSearch()
    }
    const handlePrevious = () => {
        service.selectPrevious()
    }
    const handleNext = () => {
        service.selectNext()
    }
    const handleCaseToggle = () => {
        service.toggleCaseSensitive()
    }

    return (
        <Box
            aria-label="Conversation search"
            role="search"
            sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 0.75, minWidth: 0 }}
        >
            <TextField
                autoFocus
                onChange={handleTermChange}
                onKeyDown={handleInputKeyDown}
                placeholder="Find in conversation"
                size="small"
                slotProps={{
                    htmlInput: { 'aria-label': 'Find in conversation' },
                    input: {
                        startAdornment: (
                            <InputAdornment position="start">
                                <Tooltip title="Search">
                                    <IconButton aria-label="Search" edge="start" onClick={handleSubmit} size="small">
                                        <SearchOutlined fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </InputAdornment>
                        ),
                    },
                }}
                sx={{ flex: '1 1 160px', minWidth: 140 }}
                value={draftTerm}
            />
            {resultCount === null ? null : (
                <Typography aria-live="polite" sx={{ flexShrink: 0 }} variant="body2">
                    {resultCount} {resultCount === 1 ? 'result' : 'results'}
                </Typography>
            )}
            <Tooltip title="Previous result">
                <span>
                    <IconButton aria-label="Previous result" disabled={!submittedTerm} onClick={handlePrevious} size="small">
                        <ArrowUpwardOutlined fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
            <Tooltip title="Next result">
                <span>
                    <IconButton aria-label="Next result" disabled={!submittedTerm} onClick={handleNext} size="small">
                        <ArrowDownwardOutlined fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
            <Tooltip title="Match case">
                <ToggleButton
                    aria-label="Match case"
                    onClick={handleCaseToggle}
                    selected={caseSensitive}
                    size="small"
                    value="case-sensitive"
                >
                    Aa
                </ToggleButton>
            </Tooltip>
        </Box>
    )
}
