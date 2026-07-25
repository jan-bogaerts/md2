import { Box, IconButton, InputAdornment, Paper, TextField, ToggleButton, Tooltip } from '@mui/material'
import type { ChangeEvent, FocusEvent } from 'react'
import { useEffect, useState } from 'react'
import AutoFix from 'mdi-material-ui/AutoFix'
import FileSearchOutline from 'mdi-material-ui/FileSearchOutline'
import LightningBolt from 'mdi-material-ui/LightningBolt'
import Magnify from 'mdi-material-ui/Magnify'
import Regex from 'mdi-material-ui/Regex'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import { ActionPopup } from '../../actions/action_popup'
import { useActions } from '../../hooks/use_actions'
import { useProjectState } from '../../hooks/use_project_state'
import { dialogService } from '../../../services/dialog_service'
import { InvalidSearchPatternError, defaultSearchRegexpAgent, searchActions, searchProject } from '../../../services/search/search_project'
import type { SearchMode, SearchRegexpAgent, SearchResults as SearchResultsData } from '../../../services/search/search_types'
import { workspaceNavigationService } from '../../../services/project/workspace_navigation_service'
import { useWorkspaceView } from '../../hooks/use_workspace_view'
import { NO_DRAG_REGION } from '../drag_region'
import { SearchResults } from './search_results'

const RESULTS_MAX_HEIGHT = 420
const RESULTS_WIDTH = 460
const DROPDOWN_TOP_OFFSET = 4
const EMPTY_RESULTS: SearchResultsData = { active: [], actions: [], backgroundGroups: [] }
const SEARCH_ACTION_CONTEXT: ActionContext = { folder: '', kind: 'folder' }

interface SearchPanelProps {
    initialQuery: string
    onClose: () => void
    onQueryChange: (query: string) => void
    /** Builds a RegExp from the current query; defaults to the not-yet-available agent. */
    regexpAgent?: SearchRegexpAgent
}

/** Top-shell search: plain/RegExp text search over the loaded project with grouped, navigable results. */
export function SearchPanel(props: SearchPanelProps) {
    const { initialQuery, onClose, onQueryChange, regexpAgent = defaultSearchRegexpAgent } = props
    const { snapshot } = useProjectState()
    const { actions } = useActions()
    const { viewMode } = useWorkspaceView()
    const [query, setQuery] = useState(initialQuery)
    const [mode, setMode] = useState<SearchMode>('text')
    const [includeBackgroundBody, setIncludeBackgroundBody] = useState(false)
    const [includeActions, setIncludeActions] = useState(false)
    const [results, setResults] = useState<SearchResultsData>(EMPTY_RESULTS)
    const [isDismissed, setIsDismissed] = useState(false)
    const [isAgentBusy, setIsAgentBusy] = useState(false)
    const [actionPopupOpen, setActionPopupOpen] = useState(false)
    const [controlElement, setControlElement] = useState<HTMLDivElement | null>(null)

    const hasQuery = query.trim().length > 0
    const isDropdownOpen = !isDismissed
    const shouldShowResults = hasQuery

    useEffect(() => {
        controlElement?.querySelector<HTMLInputElement>('input')?.focus()
    }, [controlElement])

    // Runs the search and, on an invalid expression, keeps the previous results while surfacing the error.
    const applySearch = (nextQuery: string, nextMode: SearchMode, nextIncludeBackgroundBody: boolean, nextIncludeActions: boolean) => {
        if (nextQuery.trim().length === 0 || !snapshot) {
            setResults(EMPTY_RESULTS)

            return
        }

        try {
            const options = { includeActions: nextIncludeActions, includeBackgroundBody: nextIncludeBackgroundBody, mode: nextMode }
            const cardResults = searchProject(snapshot, nextQuery, options)
            const actionResults = searchActions(actions, nextQuery, options)
            setResults({ ...cardResults, actions: actionResults })
        } catch (error) {
            dialogService.error(error, { fallbackMessage: error instanceof InvalidSearchPatternError ? error.message : 'Search failed' })
        }
    }

    const handleSearchFocus = () => {
        setIsDismissed(false)
    }

    const handleControlBlur = (event: FocusEvent<HTMLDivElement>) => {
        const nextFocusedElement = event.relatedTarget
        if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) return
        if (actionPopupOpen) return

        onClose()
    }

    const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
        const nextQuery = event.target.value
        setQuery(nextQuery)
        onQueryChange(nextQuery)
        setIsDismissed(false)
        applySearch(nextQuery, mode, includeBackgroundBody, includeActions)
    }

    const handleToggleRegexp = () => {
        const nextMode: SearchMode = mode === 'regexp' ? 'text' : 'regexp'
        setMode(nextMode)
        setIsDismissed(false)
        applySearch(query, nextMode, includeBackgroundBody, includeActions)
    }

    const handleToggleBackgroundBody = () => {
        const nextIncludeBackgroundBody = !includeBackgroundBody
        setIncludeBackgroundBody(nextIncludeBackgroundBody)
        setIsDismissed(false)
        applySearch(query, mode, nextIncludeBackgroundBody, includeActions)
    }

    const handleToggleActions = () => {
        const nextIncludeActions = !includeActions
        setIncludeActions(nextIncludeActions)
        setIsDismissed(false)
        applySearch(query, mode, includeBackgroundBody, nextIncludeActions)
    }

    const handleAskAgent = async () => {
        if (!hasQuery) return

        setIsAgentBusy(true)
        try {
            const expression = await regexpAgent(query)
            setMode('regexp')
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

    const handleSelect = (path: string) => {
        workspaceNavigationService.open(path)
        setIsDismissed(true)
        onClose()
    }

    const handleSelectAction = (action: ActionDefinition) => {
        if (viewMode === 'text') {
            if (!action.sourcePath) throw new Error(`Action cannot be opened in text view: ${action.id}`)
            workspaceNavigationService.open(action.sourcePath)
            setIsDismissed(true)
            onClose()
            return
        }

        setActionPopupOpen(true)
        setIsDismissed(true)
    }

    const closeActionPopup = () => {
        setActionPopupOpen(false)
        onClose()
    }

    return (
        <Box onBlur={handleControlBlur} ref={setControlElement} sx={{ maxWidth: RESULTS_WIDTH, position: 'relative', width: '100%' }}>
            <Box style={NO_DRAG_REGION}>
                <TextField
                    fullWidth
                    onChange={handleQueryChange}
                    onFocus={handleSearchFocus}
                    placeholder="Search cards…"
                    size="small"
                    slotProps={{
                        htmlInput: { 'aria-label': 'Search project' },
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
                    value={query}
                    variant="outlined"
                />
            </Box>
            {isDropdownOpen ? (
                <Paper
                    aria-label="Search dropdown"
                    elevation={4}
                    role="region"
                    style={NO_DRAG_REGION}
                    sx={{
                        left: 0,
                        maxHeight: RESULTS_MAX_HEIGHT,
                        overflow: 'auto',
                        position: 'absolute',
                        right: 0,
                        top: `calc(100% + ${DROPDOWN_TOP_OFFSET}px)`,
                        zIndex: 'modal',
                    }}
                >
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
                        <Tooltip title="Search background file bodies">
                            <ToggleButton
                                aria-label="Search background file bodies"
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
                    </Box>
                    {shouldShowResults ? (
                        <SearchResults onActionSelect={handleSelectAction} onSelect={handleSelect} results={results} />
                    ) : null}
                </Paper>
            ) : null}
            {actionPopupOpen ? (
                <ActionPopup
                    anchorElement={controlElement}
                    context={SEARCH_ACTION_CONTEXT}
                    draggable
                    onClose={closeActionPopup}
                />
            ) : null}
        </Box>
    )
}
