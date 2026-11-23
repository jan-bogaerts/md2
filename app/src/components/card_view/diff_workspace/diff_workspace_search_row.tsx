import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined';
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import { Box, IconButton, InputAdornment, TextField, ToggleButton, Tooltip, Typography } from '@mui/material';
import Close from 'mdi-material-ui/Close';
import { useEffect, useRef, useSyncExternalStore, type ChangeEvent, type KeyboardEvent } from 'react';
import type { DiffWorkspaceSearchService } from './diff_workspace_search_service';

interface DiffWorkspaceSearchRowProps {
    service: DiffWorkspaceSearchService;
}

/** Fixed-header search controls for the active diff-workspace tab. */
export function DiffWorkspaceSearchRow({ service }: DiffWorkspaceSearchRowProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const open = useSyncExternalStore(service.subscribeOpen, service.getOpen, service.getOpen);
    const draftTerm = useSyncExternalStore(service.subscribeDraftTerm, service.getDraftTerm, service.getDraftTerm);
    const submittedTerm = useSyncExternalStore(service.subscribeSubmittedTerm, service.getSubmittedTerm, service.getSubmittedTerm);
    const caseSensitive = useSyncExternalStore(service.subscribeCaseSensitive, service.getCaseSensitive, service.getCaseSensitive);
    const resultCount = useSyncExternalStore(service.subscribeResultCount, service.getResultCount, service.getResultCount);
    useSyncExternalStore(service.subscribeActiveMatch, service.getActiveMatchIndex, service.getActiveMatchIndex);

    useEffect(() => service.subscribeFocusRequested(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }), [service]);

    if (!open) return null;

    const handleTermChange = (event: ChangeEvent<HTMLInputElement>) => {
        service.setDraftTerm(event.target.value);
    };
    const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;

        event.preventDefault();
        service.submitSearch();
    };
    const handleSubmit = () => {
        service.submitSearch();
    };
    const handlePrevious = () => {
        service.selectPrevious();
    };
    const handleNext = () => {
        service.selectNext();
    };
    const handleCaseToggle = () => {
        service.toggleCaseSensitive();
    };
    const handleClose = () => {
        service.closeSearch();
    };

    return (
        <Box
            aria-label="Diff search"
            role="search"
            sx={{ alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', display: 'flex', flexWrap: 'wrap', gap: 0.75, minWidth: 0, px: 1.5, py: 1 }}
        >
            <TextField
                autoFocus
                inputRef={inputRef}
                onChange={handleTermChange}
                onKeyDown={handleInputKeyDown}
                placeholder="Find in diff"
                size="small"
                slotProps={{
                    htmlInput: { 'aria-label': 'Find in diff' },
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
                <ToggleButton aria-label="Match case" onClick={handleCaseToggle} selected={caseSensitive} size="small" value="case-sensitive">
                    Aa
                </ToggleButton>
            </Tooltip>
            <Tooltip title="Close search">
                <IconButton aria-label="Close search" onClick={handleClose} size="small">
                    <Close fontSize="small" />
                </IconButton>
            </Tooltip>
        </Box>
    );
}
