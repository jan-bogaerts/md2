import { Box, Popover } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    SEARCH_OPEN_REQUESTED_EVENT,
    searchOpenService,
} from '../../../services/search/search_open_service';
import type { SearchRegexpAgent } from '../../../services/search/search_types';
import { NO_DRAG_REGION } from '../drag_region';
import { SearchPanel } from './search_panel';
import { SearchLauncher } from './search_launcher';
import { SEARCH_PLACEHOLDERS, type SearchPresentation } from './search_field_styles';

const RESULTS_WIDTH = 460;

interface SearchControlProps {
    isMobile?: boolean;
    presentation?: SearchPresentation;
    /** Builds a RegExp from the current query; defaults to the not-yet-available agent. */
    regexpAgent?: SearchRegexpAgent;
}

/** Lightweight launcher; narrow headers open the editable search in an anchored popover. */
export function SearchControl(props: SearchControlProps) {
    const { isMobile = false, presentation = 'full', regexpAgent } = props;
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [searchAnchorElement, setSearchAnchorElement] = useState<HTMLElement | null>(null);
    const controlElement = useRef<HTMLDivElement | null>(null);
    const launcherPresentation = isMobile ? 'icon' : presentation;
    const usesPopover = isMobile || presentation === 'icon' || presentation === 'shortcut';

    const openSearch = useCallback(() => {
        const anchorElement = controlElement.current;
        if (!anchorElement) throw new Error('Cannot open search without its anchor');
        setSearchAnchorElement(anchorElement);
        setIsOpen(true);
    }, []);

    useEffect(() => {
        searchOpenService.addEventListener(SEARCH_OPEN_REQUESTED_EVENT, openSearch);

        return () => searchOpenService.removeEventListener(SEARCH_OPEN_REQUESTED_EVENT, openSearch);
    }, [openSearch]);

    const closeSearch = () => {
        setIsOpen(false);
    };

    const updateQuery = (nextQuery: string) => {
        setQuery(nextQuery);
    };

    return (
        <Box data-search-presentation={launcherPresentation} ref={controlElement} style={NO_DRAG_REGION} sx={{ position: 'relative', width: '100%' }}>
            <SearchLauncher
                isOpen={isOpen && !usesPopover}
                onOpen={openSearch}
                presentation={launcherPresentation}
                query={query}
            />
            {isOpen && !usesPopover ? (
                <SearchPanel
                    initialQuery={query}
                    onClose={closeSearch}
                    onQueryChange={updateQuery}
                    placeholder={SEARCH_PLACEHOLDERS[presentation]}
                    regexpAgent={regexpAgent}
                />
            ) : null}
            <Popover
                anchorEl={searchAnchorElement}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                disableAutoFocus
                onClose={closeSearch}
                open={isOpen && usesPopover}
                slotProps={{paper: { sx: { mt: 0.5, overflow: 'visible', p: 1, width: `min(${RESULTS_WIDTH}px, calc(100vw - 32px))` } }}}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            >
                {isOpen && usesPopover ? (
                    <SearchPanel initialQuery={query} onClose={closeSearch} onQueryChange={updateQuery} regexpAgent={regexpAgent} />
                ) : null}
            </Popover>
        </Box>
    );
}
