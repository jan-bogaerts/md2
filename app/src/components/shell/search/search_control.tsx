import { Box, Popover } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    SEARCH_OPEN_REQUESTED_EVENT,
    searchOpenService,
} from '../../../services/search/search_open_service';
import type { SearchOptions, SearchRegexpAgent, SearchResults } from '../../../services/search/search_types';
import { NO_DRAG_REGION } from '../drag_region';
import { SearchPanel } from './search_panel';
import { SearchLauncher } from './search_launcher';
import { SEARCH_PLACEHOLDERS, type SearchPresentation } from './search_field_styles';

const RESULTS_WIDTH = 460;
const DEFAULT_SEARCH_OPTIONS: SearchOptions = { includeActions: false, includeBackgroundBody: false, mode: 'text' };
const EMPTY_SEARCH_RESULTS: SearchResults = { active: [], actions: [], backgroundGroups: [] };

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
    const [searchOptions, setSearchOptions] = useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);
    const [searchResults, setSearchResults] = useState<SearchResults>(EMPTY_SEARCH_RESULTS);
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

    const updateSearchOptions = (nextSearchOptions: SearchOptions) => {
        setSearchOptions(nextSearchOptions);
    };

    const updateSearchResults = (nextSearchResults: SearchResults) => {
        setSearchResults(nextSearchResults);
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
                    initialOptions={searchOptions}
                    initialQuery={query}
                    initialResults={searchResults}
                    onClose={closeSearch}
                    onOptionsChange={updateSearchOptions}
                    onQueryChange={updateQuery}
                    onResultsChange={updateSearchResults}
                    placeholder={SEARCH_PLACEHOLDERS[presentation]}
                    regexpAgent={regexpAgent}
                />
            ) : null}
            <Popover
                anchorEl={searchAnchorElement}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                disableAutoFocus
                disableRestoreFocus
                onClose={closeSearch}
                open={isOpen && usesPopover}
                slotProps={{paper: { sx: { mt: 0.5, overflow: 'visible', p: 1, width: `min(${RESULTS_WIDTH}px, calc(100vw - 32px))` } }}}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            >
                {isOpen && usesPopover ? (
                    <SearchPanel
                        initialOptions={searchOptions}
                        initialQuery={query}
                        initialResults={searchResults}
                        onClose={closeSearch}
                        onOptionsChange={updateSearchOptions}
                        onQueryChange={updateQuery}
                        onResultsChange={updateSearchResults}
                        regexpAgent={regexpAgent}
                    />
                ) : null}
            </Popover>
        </Box>
    );
}
