import { Box, IconButton, InputAdornment, TextField, ToggleButton, Tooltip, Typography } from '@mui/material'
import type { ChangeEvent, FocusEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import AutoFix from 'mdi-material-ui/AutoFix'
import Close from 'mdi-material-ui/Close'
import CloseCircleOutline from 'mdi-material-ui/CloseCircleOutline'
import FileSearchOutline from 'mdi-material-ui/FileSearchOutline'
import LightningBolt from 'mdi-material-ui/LightningBolt'
import Magnify from 'mdi-material-ui/Magnify'
import Regex from 'mdi-material-ui/Regex'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import { ActionPopup } from '../../actions/run/popup/action_popup'
import { useActions } from '../../hooks/use_actions'
import { useProjectState } from '../../hooks/use_project_state'
import { dialogService } from '../../../services/dialog_service'
import { InvalidSearchPatternError, defaultSearchRegexpAgent, searchActions, searchProject } from '../../../services/search/search_project'
import { GLOBAL_SEARCH_SHORTCUT_BINDING } from '../../../services/search/search_open_service'
import type { SearchMatch, SearchMode, SearchOptions, SearchRegexpAgent, SearchResults as SearchResultsData } from '../../../services/search/search_types'
import { formatShortcut } from '../../../services/shortcuts/keyboard_platform'
import { workspaceNavigationService } from '../../../services/project/workspace_navigation_service'
import { useWorkspaceView } from '../../hooks/use_workspace_view'
import { NO_DRAG_REGION } from '../drag_region'
import { ResizablePopper } from '../../resizable_popper'
import { SearchResults } from './search_results'
import { useProjectConfig } from '../../hooks/use_project_config'
import { SearchCardPreviewDialog } from './search_card_preview_dialog'
import { SEARCH_INPUT_STYLES, SEARCH_SHORTCUT_STYLES } from './search_field_styles';

const RESULTS_MAX_HEIGHT = 420
const RESULTS_WIDTH = 460
const RESULTS_SIZE_STORAGE_KEY = 'search-panel-results-size'
const SEARCH_DROPDOWN_LABEL_ID = 'search-dropdown-label'
const EMPTY_RESULTS: SearchResultsData = { active: [], actions: [], backgroundGroups: [] }
const SEARCH_ACTION_CONTEXT: ActionContext = { folder: '', kind: 'folder' }

function isPathInFolder(path: string, folder: string) {
    const normalizedPath = path.replace(/\\/gu, '/').replace(/\/+$/u, '')
    const normalizedFolder = folder.replace(/\\/gu, '/').replace(/\/+$/u, '')

    return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`)
}

interface SearchPanelProps {
    /** Options restored when the panel remounts, e.g. after a presentation change. */
    initialOptions: SearchOptions
    initialQuery: string
    /** Results restored when the panel remounts, e.g. after a presentation change. */
    initialResults: SearchResultsData
    placeholder?: string;
    onClose: () => void
    onOptionsChange: (options: SearchOptions) => void
    onQueryChange: (query: string) => void
    onResultsChange: (results: SearchResultsData) => void
    /** Builds a RegExp from the current query; defaults to the not-yet-available agent. */
    regexpAgent?: SearchRegexpAgent
}

/** Top-shell search: plain/RegExp text search over the loaded project with grouped, navigable results. */
export function SearchPanel(props: SearchPanelProps) {
    const { initialOptions, initialQuery, initialResults, onClose, onOptionsChange, onQueryChange, onResultsChange, placeholder = 'Search cards…', regexpAgent = defaultSearchRegexpAgent } = props;
    const { snapshot } = useProjectState()
    const projectConfig = useProjectConfig()
    const { actions } = useActions()
    const { viewMode } = useWorkspaceView()
    const [query, setQuery] = useState(initialQuery)
    const [mode, setMode] = useState<SearchMode>(initialOptions.mode)
    const [includeBackgroundBody, setIncludeBackgroundBody] = useState(initialOptions.includeBackgroundBody)
    const [includeActions, setIncludeActions] = useState(initialOptions.includeActions)
    const [results, setResults] = useState<SearchResultsData>(initialResults)
    const [isDismissed, setIsDismissed] = useState(false)
    const [isAgentBusy, setIsAgentBusy] = useState(false)
    const [actionPopupOpen, setActionPopupOpen] = useState(false)
    const [previewMatch, setPreviewMatch] = useState<SearchMatch | null>(null)
    const [controlElement, setControlElement] = useState<HTMLDivElement | null>(null)
    const resultsElement = useRef<HTMLDivElement | null>(null)
    const shortcutLabel = formatShortcut(GLOBAL_SEARCH_SHORTCUT_BINDING)

    const hasQuery = query.trim().length > 0
    const isDropdownOpen = !isDismissed
    const shouldShowResults = hasQuery

    useEffect(() => {
        controlElement?.querySelector<HTMLInputElement>('input')?.focus()
    }, [controlElement])

    const updateResults = (nextResults: SearchResultsData) => {
        setResults(nextResults)
        onResultsChange(nextResults)
    }

    // Runs the search and, on an invalid expression, keeps the previous results while surfacing the error.
    const applySearch = (nextQuery: string, nextMode: SearchMode, nextIncludeBackgroundBody: boolean, nextIncludeActions: boolean) => {
        if (nextQuery.trim().length === 0 || !snapshot) {
            updateResults(EMPTY_RESULTS)

            return
        }

        try {
            const options = { includeActions: nextIncludeActions, includeBackgroundBody: nextIncludeBackgroundBody, mode: nextMode }
            const specialFolderPaths = projectConfig
                ? [projectConfig.releasesFolder, projectConfig.archivedFolder]
                : []
            const cardResults = searchProject(snapshot, nextQuery, options, specialFolderPaths)
            const actionResults = searchActions(actions, nextQuery, options)
            const nextResults: SearchResultsData = { ...cardResults, actions: actionResults }
            updateResults(nextResults)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: error instanceof InvalidSearchPatternError ? error.message : 'Search failed' })
        }
    }

    const handleSearchFocus = () => {
        setIsDismissed(false)
    }

    const handleSearchBlur = (event: FocusEvent<HTMLDivElement>) => {
        const nextFocusedElement = event.relatedTarget
        if (nextFocusedElement instanceof Node
            && (event.currentTarget.contains(nextFocusedElement) || resultsElement.current?.contains(nextFocusedElement))) return
        if (actionPopupOpen || previewMatch) return

        onClose()
    }

    const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
        const nextQuery = event.target.value
        setQuery(nextQuery)
        onQueryChange(nextQuery)
        setIsDismissed(false)
        applySearch(nextQuery, mode, includeBackgroundBody, includeActions)
    }

    const handleClearSearch = () => {
        setQuery('')
        onQueryChange('')
        updateResults(EMPTY_RESULTS)
        setIsDismissed(false)
        controlElement?.querySelector<HTMLInputElement>('input')?.focus()
    }

    const handleToggleRegexp = () => {
        const nextMode: SearchMode = mode === 'regexp' ? 'text' : 'regexp'
        setMode(nextMode)
        const nextOptions: SearchOptions = { includeActions, includeBackgroundBody, mode: nextMode }
        onOptionsChange(nextOptions)
        setIsDismissed(false)
        applySearch(query, nextMode, includeBackgroundBody, includeActions)
    }

    const handleToggleBackgroundBody = () => {
        const nextIncludeBackgroundBody = !includeBackgroundBody
        setIncludeBackgroundBody(nextIncludeBackgroundBody)
        const nextOptions: SearchOptions = { includeActions, includeBackgroundBody: nextIncludeBackgroundBody, mode }
        onOptionsChange(nextOptions)
        setIsDismissed(false)
        applySearch(query, mode, nextIncludeBackgroundBody, includeActions)
    }

    const handleToggleActions = () => {
        const nextIncludeActions = !includeActions
        setIncludeActions(nextIncludeActions)
        const nextOptions: SearchOptions = { includeActions: nextIncludeActions, includeBackgroundBody, mode }
        onOptionsChange(nextOptions)
        setIsDismissed(false)
        applySearch(query, mode, includeBackgroundBody, nextIncludeActions)
    }

    const handleAskAgent = async () => {
        if (!hasQuery) return

        setIsAgentBusy(true)
        try {
            const expression = await regexpAgent(query)
            setMode('regexp')
            const nextOptions: SearchOptions = { includeActions, includeBackgroundBody, mode: 'regexp' }
            onOptionsChange(nextOptions)
            setQuery(expression)
            onQueryChange(expression)
            setIsDismissed(false)
            applySearch(expression, 'regexp', includeBackgroundBody, includeActions)
        } catch (error) {
            // Agent failures must not change the current query.
            dialogService.error(error, { fallbackMessage: 'Agent request failed' })
        } finally {
            setIsAgentBusy(false)
        }
    }

    const handleSelect = (match: SearchMatch) => {
        try {
            if (!snapshot) throw new Error(`Search result no longer exists: ${match.path}`)

            const activeCard = snapshot.activeCards.find(({ path }) => path === match.path)
            const resolvedCard = activeCard ?? snapshot.backgroundCards.find(({ path }) => path === match.path)
            if (!resolvedCard) throw new Error(`Search result no longer exists: ${match.path}`)

            if (viewMode !== 'cards') {
                workspaceNavigationService.open(resolvedCard.path)
                setIsDismissed(true)
                onClose()
                return
            }

            if (activeCard) {
                workspaceNavigationService.revealCard(activeCard.path)
                setIsDismissed(true)
                onClose()
                return
            }

            if (!projectConfig) throw new Error('Cannot classify search result without project configuration')

            const { archivedFolder, releasesFolder } = projectConfig
            const isFormerCard = !!resolvedCard.header.internalId
                && (isPathInFolder(resolvedCard.path, archivedFolder) || isPathInFolder(resolvedCard.path, releasesFolder))
            if (isFormerCard) {
                setPreviewMatch({ ...match, card: resolvedCard, path: resolvedCard.path })
                setIsDismissed(true)
                return
            }

            workspaceNavigationService.open(resolvedCard.path)
            setIsDismissed(true)
            onClose()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Search result could not be opened' })
        }
    }

    const handleSelectAction = (action: ActionDefinition) => {
        try {
            if (viewMode === 'text') {
                if (!action.sourcePath) throw new Error(`Action cannot be opened in text view: ${action.id}`)
                workspaceNavigationService.open(action.sourcePath)
                setIsDismissed(true)
                onClose()
                return
            }

            setActionPopupOpen(true)
            setIsDismissed(true)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Action search result could not be opened' })
        }
    }

    const closeActionPopup = () => {
        setActionPopupOpen(false)
        onClose()
    }

    const closeCardPreview = () => {
        setPreviewMatch(null)
        onClose()
    }

    return (
        <Box onBlur={handleSearchBlur} ref={setControlElement} sx={{ maxWidth: RESULTS_WIDTH, position: 'relative', width: '100%' }}>
            <Box style={NO_DRAG_REGION}>
                <TextField
                    fullWidth
                    onChange={handleQueryChange}
                    onFocus={handleSearchFocus}
                    placeholder={placeholder}
                    size="small"
                    slotProps={{
                        htmlInput: { 'aria-label': 'Search project' },
                        input: {
                            endAdornment: (
                                <InputAdornment position="end" sx={{ gap: 0.5 }}>
                                    {query ? (
                                        <Tooltip title="Clear search">
                                            <IconButton aria-label="Clear search" onClick={handleClearSearch} size="small">
                                                <CloseCircleOutline fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    ) : null}
                                    <Box
                                        component="span"
                                        sx={SEARCH_SHORTCUT_STYLES}
                                    >
                                        {shortcutLabel}
                                    </Box>
                                </InputAdornment>
                            ),
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Magnify fontSize="small" />
                                </InputAdornment>
                            ),
                            sx: SEARCH_INPUT_STYLES,
                        },
                    }}
                    value={query}
                    variant="outlined"
                />
            </Box>
            {isDropdownOpen ? (
                <ResizablePopper
                    anchorElement={controlElement}
                    closeOnEscape={false}
                    constrainSizeToViewport
                    draggable={false}
                    initialSize={{ height: RESULTS_MAX_HEIGHT, width: RESULTS_WIDTH }}
                    labelId={SEARCH_DROPDOWN_LABEL_ID}
                    open={isDropdownOpen}
                    paperSx={{ ...NO_DRAG_REGION, flexDirection: 'column', overflow: 'auto' }}
                    resizeCorner="lower-right"
                    resizeLabel="Resize search results"
                    storageKey={RESULTS_SIZE_STORAGE_KEY}
                >
                    <Box ref={resultsElement} sx={{ display: 'contents' }}>
                        <Typography
                            id={SEARCH_DROPDOWN_LABEL_ID}
                            sx={{ clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, overflow: 'hidden', position: 'absolute', whiteSpace: 'nowrap', width: 1 }}
                        >
                            Search dropdown
                        </Typography>
                        <Box aria-label="Search options" role="group" sx={{ alignItems: 'center', display: 'flex', gap: 1, p: 1 }}>
                            <Tooltip title="RegExp mode">
                                <ToggleButton
                                    aria-label="RegExp mode"
                                    onChange={handleToggleRegexp}
                                    selected={mode === 'regexp'}
                                    size="small"
                                    value="regexp"
                                >
                                    <Regex fontSize="small" />
                                </ToggleButton>
                            </Tooltip>
                            <Tooltip title="Search released and archived file bodies">
                                <ToggleButton
                                    aria-label="Search released and archived file bodies"
                                    onChange={handleToggleBackgroundBody}
                                    selected={includeBackgroundBody}
                                    size="small"
                                    value="background-body"
                                >
                                    <FileSearchOutline fontSize="small" />
                                </ToggleButton>
                            </Tooltip>
                            <Tooltip title="Search actions">
                                <ToggleButton
                                    aria-label="Search actions"
                                    onChange={handleToggleActions}
                                    selected={includeActions}
                                    size="small"
                                    value="actions"
                                >
                                    <LightningBolt fontSize="small" />
                                </ToggleButton>
                            </Tooltip>
                            <Tooltip title="Ask agent to build a RegExp">
                                <span>
                                    <IconButton
                                        aria-label="Ask agent to build a RegExp"
                                        disabled={isAgentBusy || !hasQuery}
                                        onClick={handleAskAgent}
                                        size="small"
                                    >
                                        <AutoFix fontSize="small" />
                                    </IconButton>
                                </span>
                            </Tooltip>
                            <Box sx={{ flex: 1 }} />
                            <Tooltip title="Close search">
                                <IconButton aria-label="Close search" onClick={onClose} size="small">
                                    <Close fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>
                        {shouldShowResults ? (
                            <SearchResults
                                mode={mode}
                                onActionSelect={handleSelectAction}
                                onSelect={handleSelect}
                                query={query}
                                results={results}
                            />
                        ) : null}
                    </Box>
                </ResizablePopper>
            ) : null}
            {actionPopupOpen ? (
                <ActionPopup
                    anchorElement={controlElement}
                    context={SEARCH_ACTION_CONTEXT}
                    draggable
                    onClose={closeActionPopup}
                />
            ) : null}
            <SearchCardPreviewDialog match={previewMatch} onClose={closeCardPreview} />
        </Box>
    )
}
