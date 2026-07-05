import { Alert, Box, IconButton, InputAdornment, Paper, TextField, ToggleButton, Tooltip } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useState } from 'react'
import AutoFix from 'mdi-material-ui/AutoFix'
import FileSearchOutline from 'mdi-material-ui/FileSearchOutline'
import Magnify from 'mdi-material-ui/Magnify'
import Regex from 'mdi-material-ui/Regex'
import { useProjectState } from '../../hooks/use_project_state'
import { InvalidSearchPatternError, defaultSearchRegexpAgent, searchProject } from '../../../services/search/search_project'
import type { SearchMode, SearchRegexpAgent, SearchResults as SearchResultsData } from '../../../services/search/search_types'
import { workspaceNavigationService } from '../../../services/workspace_navigation_service'
import { NO_DRAG_REGION } from '../drag_region'
import { SearchResults } from './search_results'

const RESULTS_MAX_HEIGHT = 420
const RESULTS_WIDTH = 460
const EMPTY_RESULTS: SearchResultsData = { active: [], backgroundGroups: [] }

interface SearchControlProps {
    /** Builds a RegExp from the current query; defaults to the not-yet-available agent. */
    regexpAgent?: SearchRegexpAgent
}

/** Top-shell search: plain/RegExp text search over the loaded project with grouped, navigable results. */
export function SearchControl(props: SearchControlProps) {
    const { regexpAgent = defaultSearchRegexpAgent } = props
    const { snapshot } = useProjectState()
    const [query, setQuery] = useState('')
    const [mode, setMode] = useState<SearchMode>('text')
    const [includeBackgroundBody, setIncludeBackgroundBody] = useState(false)
    const [results, setResults] = useState<SearchResultsData>(EMPTY_RESULTS)
    const [validationError, setValidationError] = useState<string | null>(null)
    const [agentError, setAgentError] = useState<string | null>(null)
    const [isDismissed, setIsDismissed] = useState(false)
    const [isAgentBusy, setIsAgentBusy] = useState(false)

    const errorMessage = validationError ?? agentError
    const isOpen = query.trim().length > 0 && !isDismissed

    // Runs the search and, on an invalid expression, keeps the previous results while surfacing the error.
    const applySearch = (nextQuery: string, nextMode: SearchMode, nextIncludeBackgroundBody: boolean) => {
        if (nextQuery.trim().length === 0 || !snapshot) {
            setResults(EMPTY_RESULTS)
            setValidationError(null)

            return
        }

        try {
            setResults(searchProject(snapshot, nextQuery, { includeBackgroundBody: nextIncludeBackgroundBody, mode: nextMode }))
            setValidationError(null)
        } catch (error) {
            setValidationError(error instanceof InvalidSearchPatternError ? error.message : 'Search failed')
        }
    }

    const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
        const nextQuery = event.target.value
        setQuery(nextQuery)
        setIsDismissed(false)
        setAgentError(null)
        applySearch(nextQuery, mode, includeBackgroundBody)
    }

    const handleToggleRegexp = () => {
        const nextMode: SearchMode = mode === 'regexp' ? 'text' : 'regexp'
        setMode(nextMode)
        setIsDismissed(false)
        applySearch(query, nextMode, includeBackgroundBody)
    }

    const handleToggleBackgroundBody = () => {
        const nextIncludeBackgroundBody = !includeBackgroundBody
        setIncludeBackgroundBody(nextIncludeBackgroundBody)
        setIsDismissed(false)
        applySearch(query, mode, nextIncludeBackgroundBody)
    }

    const handleAskAgent = async () => {
        if (query.trim().length === 0) return

        setIsAgentBusy(true)
        setAgentError(null)
        try {
            const expression = await regexpAgent(query)
            setMode('regexp')
            setQuery(expression)
            setIsDismissed(false)
            applySearch(expression, 'regexp', includeBackgroundBody)
        } catch (error) {
            // Agent failures must not change the current query.
            setAgentError(error instanceof Error ? error.message : 'Agent request failed')
        } finally {
            setIsAgentBusy(false)
        }
    }

    const handleSelect = (path: string) => {
        workspaceNavigationService.open(path)
        setIsDismissed(true)
    }

    return (
        <Box sx={{ maxWidth: RESULTS_WIDTH, position: 'relative', width: '100%' }}>
            <Box style={NO_DRAG_REGION} sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                <TextField
                    fullWidth
                    onChange={handleQueryChange}
                    placeholder="Search"
                    size="small"
                    slotProps={{
                        htmlInput: { 'aria-label': 'Search project' },
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Magnify fontSize="small" />
                                </InputAdornment>
                            ),
                        },
                    }}
                    value={query}
                />
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
                <Tooltip title="Ask agent to build a RegExp">
                    <span>
                        <IconButton
                            aria-label="Ask agent to build a RegExp"
                            disabled={isAgentBusy || query.trim().length === 0}
                            onClick={handleAskAgent}
                            size="small"
                        >
                            <AutoFix fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>
            {errorMessage ? (
                <Alert severity="error" style={NO_DRAG_REGION} sx={{ mt: 0.5 }}>
                    {errorMessage}
                </Alert>
            ) : null}
            {isOpen ? (
                <Paper
                    elevation={4}
                    style={NO_DRAG_REGION}
                    sx={{ left: 0, maxHeight: RESULTS_MAX_HEIGHT, overflow: 'auto', position: 'absolute', right: 0, top: '100%', zIndex: 'modal' }}
                >
                    <SearchResults onSelect={handleSelect} results={results} />
                </Paper>
            ) : null}
        </Box>
    )
}
