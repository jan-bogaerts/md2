import {
    LexicalTypeaheadMenuPlugin,
    type MenuResolution,
    type TriggerFn,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { useCellValue } from '@mdxeditor/editor'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_HIGH, type TextNode } from 'lexical';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RESET_MARKDOWN_DRAFT_COMMAND } from '../data_sources/reset_markdown_draft_command';
import { markdownFileSearchConfig$ } from './markdown_file_search_config_cell'
import { renderFileSearchMenu } from './markdown_file_search_menu_renderer'
import { MarkdownFileSearchOption } from './markdown_file_search_option'
import { createFileSearchOptions } from './markdown_file_search_options'
import type { MarkdownFileSearchAnchorRect } from './markdown_file_search_session_context'
import { MarkdownFileSearchSessionProvider } from './markdown_file_search_session_provider'
import { replaceFileSearchQuery } from './markdown_file_search_selection'
import { matchFileSearchTriggerForFiles } from './markdown_file_search_trigger'

/** Shows repository files at the caret after the user types `@`. */
export function MarkdownFileSearchTypeaheadPlugin() {
    const [editor] = useLexicalComposerContext();
    const { overlayContainer, repositoryFiles } = useCellValue(markdownFileSearchConfig$)
    const hasCapturedAnchorRef = useRef(false)
    const [anchorRect, setAnchorRect] = useState<MarkdownFileSearchAnchorRect | null>(null)
    const [query, setQuery] = useState<string | null>(null)
    const options = useMemo(
        () => createFileSearchOptions(repositoryFiles, query),
        [query, repositoryFiles],
    )

    const triggerFn = useCallback<TriggerFn>(
        (text) => matchFileSearchTriggerForFiles(text, repositoryFiles),
        [repositoryFiles],
    )

    const handleQueryChange = useCallback((nextQuery: string | null) => {
        setQuery(nextQuery)
    }, [])

    const handleOpen = useCallback((resolution: MenuResolution) => {
        if (hasCapturedAnchorRef.current) return

        hasCapturedAnchorRef.current = true
        const { height, left, top, width } = resolution.getRect()
        setAnchorRect({ height, left, top, width })
    }, [])

    const handleClose = useCallback(() => {
        hasCapturedAnchorRef.current = false
        setAnchorRect(null)
    }, [])

    const handleDraftReset = useCallback(() => {
        handleClose();
        setQuery(null);
        return false;
    }, [handleClose]);
    useEffect(() => editor.registerCommand(RESET_MARKDOWN_DRAFT_COMMAND, handleDraftReset, COMMAND_PRIORITY_HIGH),
        [editor, handleDraftReset]);

    const handleSelectOption = useCallback((
        option: MarkdownFileSearchOption,
        textNodeContainingQuery: TextNode | null,
        closeMenu: () => void,
    ) => {
        replaceFileSearchQuery(option, textNodeContainingQuery, closeMenu)
    }, [])

    return (
        <MarkdownFileSearchSessionProvider anchorRect={anchorRect}>
            <LexicalTypeaheadMenuPlugin<MarkdownFileSearchOption>
                menuRenderFn={renderFileSearchMenu}
                onClose={handleClose}
                onOpen={handleOpen}
                onQueryChange={handleQueryChange}
                onSelectOption={handleSelectOption}
                options={options}
                parent={overlayContainer ?? undefined}
                triggerFn={triggerFn}
            />
        </MarkdownFileSearchSessionProvider>
    )
}
