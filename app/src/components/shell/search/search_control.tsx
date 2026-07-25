import { Box, IconButton, InputAdornment, Popover, TextField, Tooltip } from '@mui/material'
import type { MouseEvent } from 'react'
import { useState } from 'react'
import Magnify from 'mdi-material-ui/Magnify'
import type { SearchRegexpAgent } from '../../../services/search/search_types'
import { NO_DRAG_REGION } from '../drag_region'
import { SearchPanel } from './search_panel'

const RESULTS_WIDTH = 460

interface SearchControlProps {
    isMobile?: boolean
    /** Builds a RegExp from the current query; defaults to the not-yet-available agent. */
    regexpAgent?: SearchRegexpAgent
}

/** Lightweight search launcher that mounts data-aware search only while open. */
export function SearchControl(props: SearchControlProps) {
    const { isMobile = false, regexpAgent } = props
    const [query, setQuery] = useState('')
    const [desktopOpen, setDesktopOpen] = useState(false)
    const [searchAnchorElement, setSearchAnchorElement] = useState<HTMLElement | null>(null)

    const openDesktop = () => {
        setDesktopOpen(true)
    }

    const closeDesktop = () => {
        setDesktopOpen(false)
    }

    const openMobile = (event: MouseEvent<HTMLElement>) => {
        setSearchAnchorElement(event.currentTarget)
    }

    const closeMobile = () => {
        setSearchAnchorElement(null)
    }

    const updateQuery = (nextQuery: string) => {
        setQuery(nextQuery)
    }

    if (!isMobile) {
        if (desktopOpen) {
            return (
                <SearchPanel
                    initialQuery={query}
                    onClose={closeDesktop}
                    onQueryChange={updateQuery}
                    regexpAgent={regexpAgent}
                />
            )
        }

        return (
            <TextField
                fullWidth
                onFocus={openDesktop}
                placeholder="Search cards…"
                size="small"
                slotProps={{
                    htmlInput: { 'aria-label': 'Search project', readOnly: true },
                    input: {
                        endAdornment: (
                            <InputAdornment position="end">
                                <Box
                                    component="span"
                                    sx={{
                                        border: 1,
                                        borderColor: 'divider',
                                        borderRadius: 0.5,
                                        color: 'text.disabled',
                                        fontSize: 10.5,
                                        lineHeight: 1.4,
                                        px: 0.75,
                                    }}
                                >
                                    ⌘K
                                </Box>
                            </InputAdornment>
                        ),
                        startAdornment: (
                            <InputAdornment position="start">
                                <Magnify fontSize="small" />
                            </InputAdornment>
                        ),
                        sx: {
                            bgcolor: 'background.default',
                            borderRadius: 99,
                            fontSize: 13,
                            height: 32,
                            '& fieldset': { borderColor: 'divider' },
                        },
                    },
                }}
                style={NO_DRAG_REGION}
                value={query}
                variant="outlined"
            />
        )
    }

    return (
        <>
            <Tooltip title="Search">
                <IconButton
                    aria-label="Search"
                    onClick={openMobile}
                    size="small"
                    sx={{ height: 34, width: 34 }}
                >
                    <Magnify />
                </IconButton>
            </Tooltip>
            <Popover
                anchorEl={searchAnchorElement}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                disableAutoFocus
                onClose={closeMobile}
                open={!!searchAnchorElement}
                slotProps={{paper: { sx: { mt: 0.5, overflow: 'visible', p: 1, width: `min(${RESULTS_WIDTH}px, calc(100vw - 32px))` } }}}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            >
                {searchAnchorElement ? (
                    <SearchPanel
                        initialQuery={query}
                        onClose={closeMobile}
                        onQueryChange={updateQuery}
                        regexpAgent={regexpAgent}
                    />
                ) : null}
            </Popover>
        </>
    )
}
