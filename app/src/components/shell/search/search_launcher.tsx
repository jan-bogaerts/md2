import { Box, IconButton, InputAdornment, TextField, Tooltip } from '@mui/material';
import Magnify from 'mdi-material-ui/Magnify';
import { GLOBAL_SEARCH_SHORTCUT_BINDING } from '../../../services/search/search_open_service';
import { formatShortcut } from '../../../services/shortcuts/keyboard_platform';
import { NO_DRAG_REGION } from '../drag_region';
import { SEARCH_INPUT_STYLES, SEARCH_PLACEHOLDERS, SEARCH_SHORTCUT_STYLES, type SearchPresentation } from './search_field_styles';

interface SearchLauncherProps {
    isOpen: boolean;
    onOpen: () => void;
    presentation: SearchPresentation;
    query: string;
}

/** Keeps complete shortcut measurements available even when the launcher becomes an icon. */
export function SearchLauncher({ isOpen, onOpen, presentation, query }: SearchLauncherProps) {
    const shortcutLabel = formatShortcut(GLOBAL_SEARCH_SHORTCUT_BINDING);

    return (
        <>
            <Box
                aria-hidden
                data-search-metrics
                sx={{
                    alignItems: 'center', border: 1, display: 'flex', fontSize: 13, gap: 1, pointerEvents: 'none',
                    left: 0, position: 'fixed', px: 1.5, top: 0, visibility: 'hidden', whiteSpace: 'nowrap', width: 'max-content',
                }}
            >
                <Magnify data-search-icon fontSize="small" />
                <Box component="span" data-search-label><span data-search-word>Search</span> cards…</Box>
                <Box data-search-shortcut sx={{ ...SEARCH_SHORTCUT_STYLES, '&::after': { content: JSON.stringify(shortcutLabel) } }} />
            </Box>
            {!isOpen && presentation === 'icon' ? (
                <Tooltip title={`Search (${shortcutLabel})`}>
                    <IconButton aria-label="Search" onClick={onOpen} size="small" style={NO_DRAG_REGION} sx={{ height: 32, width: 32 }}>
                        <Magnify fontSize="small" />
                    </IconButton>
                </Tooltip>
            ) : null}
            {!isOpen && presentation !== 'icon' ? (
                <TextField
                    fullWidth
                    onClick={onOpen}
                    onFocus={onOpen}
                    placeholder={SEARCH_PLACEHOLDERS[presentation]}
                    size="small"
                    slotProps={{
                        htmlInput: { 'aria-label': 'Search project', readOnly: true },
                        input: {
                            endAdornment: (
                                <InputAdornment position="end">
                                    <Box component="span" sx={SEARCH_SHORTCUT_STYLES}>{shortcutLabel}</Box>
                                </InputAdornment>
                            ),
                            startAdornment: <InputAdornment position="start"><Magnify fontSize="small" /></InputAdornment>,
                            sx: SEARCH_INPUT_STYLES,
                        },
                    }}
                    style={NO_DRAG_REGION}
                    value={query}
                    variant="outlined"
                />
            ) : null}
        </>
    );
}
