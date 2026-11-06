import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined'
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined'
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined'
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import Close from 'mdi-material-ui/Close'
import SearchOutlined from '@mui/icons-material/SearchOutlined'
import { Box, Button, IconButton, InputAdornment, Paper, Popper, TextField, ToggleButton, Tooltip, Typography } from '@mui/material'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCellValue } from '@mdxeditor/editor'
import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND } from 'lexical'
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useDialogError } from '../../hooks/use_dialog_error'
import {
    getMarkdownSearchSeed,
    getMarkdownSearchSelectionEnd,
    getMarkdownSearchSelectionStart,
    replaceAllMarkdownTextMatches,
    replaceMarkdownTextMatch,
    selectMarkdownTextMatch,
    type MarkdownTextMatch,
} from './markdown_local_text_search'
import { OPEN_MARKDOWN_LOCAL_TEXT_SEARCH_COMMAND } from './markdown_local_text_search_command'
import { markdownLocalTextSearchConfig$ } from './markdown_local_text_search_config_cell'
import { RESET_MARKDOWN_DRAFT_COMMAND } from '../data_sources/reset_markdown_draft_command';
import {
    MARKDOWN_LOCAL_SEARCH_ESCAPE_REQUESTED_EVENT,
    markdownLocalSearchKeyboardService,
} from '../../../services/shortcuts/markdown_local_search_keyboard_service'

const SEARCH_POPUP_WIDTH = 460
// Aligns replacement field with search field: popup padding plus expansion button and gap.
const REPLACE_ROW_INDENT = 5.25

function isControlShortcut(event: KeyboardEvent, key: string) {
    return event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === key
}

/** Editor-local search and replace keyboard handling and popup. */
export function MarkdownLocalTextSearchPlugin() {
    const config = useCellValue(markdownLocalTextSearchConfig$)
    const [editor] = useLexicalComposerContext()
    const [activeCaseSensitive, setActiveCaseSensitive] = useState(false)
    const [activeTerm, setActiveTerm] = useState<string | null>(null)
    const [currentMatch, setCurrentMatch] = useState<MarkdownTextMatch | null>(null)
    const [draftCaseSensitive, setDraftCaseSensitive] = useState(false)
    const [draftTerm, setDraftTerm] = useState('')
    const [open, setOpen] = useState(false)
    const [replaceExpanded, setReplaceExpanded] = useState(false)
    const [replacement, setReplacement] = useState('')
    const [resultCount, setResultCount] = useState<number | null>(null)
    const [searchOrigin, setSearchOrigin] = useState(0)
    const searchInputRef = useRef<HTMLInputElement | null>(null)
    const readOnly = !!config?.readOnly
    const rootElement = editor.getRootElement()
    const editorContainer = rootElement?.closest('[data-sticky-toolbar]')
    const toolbarElement = editorContainer?.querySelector<HTMLElement>('.mdxeditor-toolbar') ?? null
    const toolbarStyle = toolbarElement ? window.getComputedStyle(toolbarElement) : null
    const toolbarVisible = !!toolbarElement && toolbarStyle?.display !== 'none' && toolbarStyle?.visibility !== 'hidden'
    const anchorElement = toolbarVisible ? toolbarElement : rootElement
    const placement = toolbarVisible ? 'bottom-end' : 'top-end'
    const configError = config ? null : new Error('Cannot register Markdown local text search without configuration')
    useDialogError(configError, 'Local text search is unavailable')

    const closeSearch = useCallback(() => {
        setOpen(false)
    }, [])

    const handleDraftReset = useCallback(() => {
        setOpen(false);
        setActiveTerm(null);
        setActiveCaseSensitive(false);
        setCurrentMatch(null);
        setDraftTerm('');
        setDraftCaseSensitive(false);
        setReplaceExpanded(false);
        setReplacement('');
        setResultCount(null);
        setSearchOrigin(0);
        return false;
    }, []);
    useEffect(() => editor.registerCommand(RESET_MARKDOWN_DRAFT_COMMAND, handleDraftReset, COMMAND_PRIORITY_HIGH),
        [editor, handleDraftReset]);

    const openSearchPopup = useCallback((expanded: boolean) => {
        const selectedText = getMarkdownSearchSeed(editor)
        setSearchOrigin(getMarkdownSearchSelectionEnd(editor))
        if (selectedText) setDraftTerm(selectedText)
        setReplaceExpanded(expanded)
        setOpen(true)
    }, [editor])

    const openSearch = useCallback(() => {
        openSearchPopup(false)
        return true
    }, [openSearchPopup])

    const openReplace = useCallback(() => {
        openSearchPopup(true)
        searchInputRef.current?.focus()
    }, [openSearchPopup])

    const selectNextMatch = useCallback(() => {
        if (!activeTerm) return
        const offset = getMarkdownSearchSelectionEnd(editor)
        const result = selectMarkdownTextMatch(editor, activeTerm, offset, activeCaseSensitive)
        setResultCount(result.count)
        setCurrentMatch(result.match)
    }, [activeCaseSensitive, activeTerm, editor])

    const selectPreviousMatch = useCallback(() => {
        if (!activeTerm) return
        const offset = getMarkdownSearchSelectionStart(editor)
        const result = selectMarkdownTextMatch(editor, activeTerm, offset, activeCaseSensitive, 'previous')
        setResultCount(result.count)
        setCurrentMatch(result.match)
    }, [activeCaseSensitive, activeTerm, editor])

    const submitSearch = useCallback(() => {
        if (!draftTerm) return
        setActiveTerm(draftTerm)
        setActiveCaseSensitive(draftCaseSensitive)
        const result = selectMarkdownTextMatch(editor, draftTerm, searchOrigin, draftCaseSensitive)
        setResultCount(result.count)
        setCurrentMatch(result.match)
    }, [draftCaseSensitive, draftTerm, editor, searchOrigin])

    const replaceCurrentMatch = useCallback(() => {
        if (!activeTerm || !currentMatch || readOnly) return
        const result = replaceMarkdownTextMatch(editor, activeTerm, currentMatch, activeCaseSensitive, replacement)
        setResultCount(result.count)
        setCurrentMatch(result.match)
    }, [activeCaseSensitive, activeTerm, currentMatch, editor, readOnly, replacement])

    const replaceAllMatches = useCallback(() => {
        if (!activeTerm || readOnly) return
        const count = replaceAllMarkdownTextMatches(editor, activeTerm, activeCaseSensitive, replacement)
        setResultCount(count)
        setCurrentMatch(null)
    }, [activeCaseSensitive, activeTerm, editor, readOnly, replacement])

    const handleSearchEscapeRequested = useCallback((event: Event) => {
        if (!open || event.defaultPrevented) return

        closeSearch()
        event.preventDefault()
    }, [closeSearch, open])

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (isControlShortcut(event, 'f')) {
            event.preventDefault()
            openSearch()
            return true
        }
        if (isControlShortcut(event, 'h')) {
            event.preventDefault()
            openReplace()
            return true
        }
        if (event.key !== 'F3') return false

        event.preventDefault()
        selectNextMatch()
        return true
    }, [openReplace, openSearch, selectNextMatch])

    useEffect(() => {
        const unregisterOpen = editor.registerCommand(
            OPEN_MARKDOWN_LOCAL_TEXT_SEARCH_COMMAND,
            openSearch,
            COMMAND_PRIORITY_HIGH,
        )
        const unregisterKeyDown = editor.registerCommand(KEY_DOWN_COMMAND, handleKeyDown, COMMAND_PRIORITY_HIGH)

        return () => {
            unregisterOpen()
            unregisterKeyDown()
        }
    }, [editor, handleKeyDown, openSearch])

    useEffect(() => {
        markdownLocalSearchKeyboardService.addEventListener(
            MARKDOWN_LOCAL_SEARCH_ESCAPE_REQUESTED_EVENT,
            handleSearchEscapeRequested,
        )

        return () => {
            markdownLocalSearchKeyboardService.removeEventListener(
                MARKDOWN_LOCAL_SEARCH_ESCAPE_REQUESTED_EVENT,
                handleSearchEscapeRequested,
            )
        }
    }, [handleSearchEscapeRequested])

    const handleTermChange = (event: ChangeEvent<HTMLInputElement>) => {
        setDraftTerm(event.target.value)
    }

    const handleReplacementChange = (event: ChangeEvent<HTMLInputElement>) => {
        setReplacement(event.target.value)
    }

    const handleReplaceToggle = () => {
        setReplaceExpanded((current) => !current)
    }

    const handleCaseToggle = () => {
        setDraftCaseSensitive((current) => !current)
    }

    const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault()
            submitSearch()
            return
        }
        if (event.key !== 'F3') return

        event.preventDefault()
        selectNextMatch()
    }

    const replaceToggleLabel = replaceExpanded ? 'Hide replace' : 'Show replace'

    return (
        <Popper
            anchorEl={anchorElement}
            container={config?.overlayContainer ?? undefined}
            open={open}
            placement={placement}
            role="dialog"
            sx={{ zIndex: 'modal' }}
        >
            <Paper sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '14px' }}>
                <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.75, p: 1, width: SEARCH_POPUP_WIDTH }}>
                    <Tooltip title={replaceToggleLabel}>
                        <IconButton
                            aria-expanded={replaceExpanded}
                            aria-label={replaceToggleLabel}
                            onClick={handleReplaceToggle}
                            size="small"
                        >
                            {replaceExpanded
                                ? <ExpandMoreOutlined fontSize="small" />
                                : <ChevronRightOutlined fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                    <TextField
                        autoFocus
                        fullWidth
                        inputRef={searchInputRef}
                        onChange={handleTermChange}
                        onKeyDown={handleInputKeyDown}
                        placeholder="Find text"
                        size="small"
                        slotProps={{
                            htmlInput: { 'aria-label': 'Find text' },
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Tooltip title="Search">
                                            <IconButton aria-label="Search" edge="start" onClick={submitSearch} size="small">
                                                <SearchOutlined fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </InputAdornment>
                                ),
                            },
                        }}
                        value={draftTerm}
                    />
                    {resultCount === null ? null : (
                        <Typography aria-live="polite" sx={{ flexShrink: 0 }} variant="body2">
                            {resultCount} {resultCount === 1 ? 'result' : 'results'}
                        </Typography>
                    )}
                    <Tooltip title="Previous result">
                        <span>
                            <IconButton
                                aria-label="Previous result"
                                disabled={!activeTerm}
                                onClick={selectPreviousMatch}
                                size="small"
                            >
                                <ArrowUpwardOutlined fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Next result">
                        <span>
                            <IconButton
                                aria-label="Next result"
                                disabled={!activeTerm}
                                onClick={selectNextMatch}
                                size="small"
                            >
                                <ArrowDownwardOutlined fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Match case">
                        <ToggleButton
                            aria-label="Match case"
                            onClick={handleCaseToggle}
                            selected={draftCaseSensitive}
                            size="small"
                            value="case-sensitive"
                        >
                            Aa
                        </ToggleButton>
                    </Tooltip>
                    <Tooltip title="Close search">
                        <IconButton aria-label="Close search" onClick={closeSearch} size="small">
                            <Close fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
                {replaceExpanded ? (
                    <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.75, pb: 1, pl: REPLACE_ROW_INDENT, pr: 1 }}>
                        <TextField
                            fullWidth
                            onChange={handleReplacementChange}
                            placeholder="Replace with"
                            size="small"
                            slotProps={{ htmlInput: { 'aria-label': 'Replace with' } }}
                            value={replacement}
                        />
                        <Button
                            disabled={!activeTerm || !currentMatch || readOnly}
                            onClick={replaceCurrentMatch}
                            size="small"
                            sx={{ flexShrink: 0 }}
                            variant="outlined"
                        >
                            Replace
                        </Button>
                        <Button
                            disabled={!activeTerm || readOnly}
                            onClick={replaceAllMatches}
                            size="small"
                            sx={{ flexShrink: 0 }}
                            variant="outlined"
                        >
                            Replace all
                        </Button>
                    </Box>
                ) : null}
            </Paper>
        </Popper>
    )
}
