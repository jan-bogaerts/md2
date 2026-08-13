import SearchOutlined from '@mui/icons-material/SearchOutlined'
import { Box, InputAdornment, Popover, TextField, ToggleButton, Tooltip } from '@mui/material'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useCellValue } from '@mdxeditor/editor'
import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND } from 'lexical'
import {
    useCallback,
    useEffect,
    useState,
    type ChangeEvent,
    type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useDialogError } from '../hooks/use_dialog_error'
import {
    getMarkdownSearchSeed,
    getMarkdownSearchSelectionEnd,
    selectMarkdownTextMatch,
} from './markdown_local_text_search'
import { OPEN_MARKDOWN_LOCAL_TEXT_SEARCH_COMMAND } from './markdown_local_text_search_command'
import { markdownLocalTextSearchConfig$ } from './markdown_local_text_search_config_cell'

function isOpenSearchShortcut(event: KeyboardEvent) {
    return event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'f'
}

/** Editor-local search keyboard handling and popup. */
export function MarkdownLocalTextSearchPlugin() {
    const config = useCellValue(markdownLocalTextSearchConfig$)
    const [editor] = useLexicalComposerContext()
    const [caseSensitive, setCaseSensitive] = useState(false)
    const [open, setOpen] = useState(false)
    const [searchOrigin, setSearchOrigin] = useState(0)
    const [term, setTerm] = useState('')
    const rootElement = editor.getRootElement()
    const configError = config ? null : new Error('Cannot register Markdown local text search without configuration')
    useDialogError(configError, 'Local text search is unavailable')

    const closeSearch = useCallback(() => {
        setOpen(false)
    }, [])

    const openSearch = useCallback(() => {
        const selectedText = getMarkdownSearchSeed(editor)
        setSearchOrigin(getMarkdownSearchSelectionEnd(editor))
        if (selectedText) setTerm(selectedText)
        setOpen(true)
        return true
    }, [editor])

    const selectNextMatch = useCallback(() => {
        const offset = getMarkdownSearchSelectionEnd(editor)
        selectMarkdownTextMatch(editor, term, offset, caseSensitive)
    }, [caseSensitive, editor, term])

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (isOpenSearchShortcut(event)) {
            event.preventDefault()
            openSearch()
            return true
        }
        if (event.key !== 'F3') return false

        event.preventDefault()
        selectNextMatch()
        return true
    }, [openSearch, selectNextMatch])

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
        if (open) selectMarkdownTextMatch(editor, term, searchOrigin, caseSensitive)
    }, [caseSensitive, editor, open, searchOrigin, term])

    const handleTermChange = (event: ChangeEvent<HTMLInputElement>) => {
        setTerm(event.target.value)
    }

    const handleCaseToggle = () => {
        setCaseSensitive((current) => !current)
    }

    const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault()
            closeSearch()
            return
        }
        if (event.key !== 'F3') return

        event.preventDefault()
        selectNextMatch()
    }

    return (
        <Popover
            anchorEl={rootElement}
            anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorPosition={rootElement ? undefined : { left: 0, top: 0 }}
            anchorReference={rootElement ? 'anchorEl' : 'anchorPosition'}
            container={config?.overlayContainer ?? undefined}
            onClose={closeSearch}
            open={open}
            slotProps={{
                paper: {
                    sx: {
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: '14px',
                    },
                },
            }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        >
            <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.75, p: 1, width: 260 }}>
                <TextField
                    autoFocus
                    fullWidth
                    onChange={handleTermChange}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Find text"
                    size="small"
                    slotProps={{
                        htmlInput: { 'aria-label': 'Find text' },
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchOutlined fontSize="small" />
                                </InputAdornment>
                            ),
                        },
                    }}
                    value={term}
                />
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
        </Popover>
    )
}
