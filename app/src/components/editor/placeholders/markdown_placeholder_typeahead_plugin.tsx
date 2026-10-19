import {
    LexicalTypeaheadMenuPlugin,
    type MenuRenderFn,
    type MenuResolution,
    type TriggerFn,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { useCellValue } from '@mdxeditor/editor'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_HIGH, type TextNode } from 'lexical';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RESET_MARKDOWN_DRAFT_COMMAND } from '../data_sources/reset_markdown_draft_command';
import type { ActionPlaceholder } from '../../../data/action_placeholders'
import { formatActionPlaceholder } from '../../../data/action_placeholders'
import { markdownPlaceholderConfig$ } from './markdown_placeholder_config_cell'
import { MarkdownPlaceholderOption } from './markdown_placeholder_option'
import { MarkdownPlaceholderMenu } from './markdown_placeholder_menu'
import { matchPlaceholderTrigger } from './markdown_placeholder_trigger'

function placeholderMatchesQuery(placeholder: ActionPlaceholder, query: string) {
    return placeholder.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
}

/** Shows supported placeholders at the caret after the user types `{{`. */
export function MarkdownPlaceholderTypeaheadPlugin() {
    const [editor] = useLexicalComposerContext();
    const { overlayContainer, placeholders } = useCellValue(markdownPlaceholderConfig$)
    const [query, setQuery] = useState('')
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
    const options = useMemo(
        () => placeholders
            .filter((placeholder) => placeholderMatchesQuery(placeholder, query))
            .map((placeholder) => new MarkdownPlaceholderOption(placeholder)),
        [placeholders, query],
    )

    const triggerFn = useCallback<TriggerFn>((text, editor) => {
        const match = matchPlaceholderTrigger(text, editor)
        if (!match || !placeholders.some((placeholder) => placeholderMatchesQuery(placeholder, match.matchingString))) return null

        return match
    }, [placeholders])

    const handleQueryChange = useCallback((nextQuery: string | null) => {
        setQuery(nextQuery ?? '')
    }, [])

    const handleOpen = useCallback((resolution: MenuResolution) => {
        setAnchorRect(resolution.getRect())
    }, [])

    const handleClose = useCallback(() => {
        setAnchorRect(null)
    }, [])

    const handleDraftReset = useCallback(() => {
        setAnchorRect(null);
        setQuery('');
        return false;
    }, []);
    useEffect(() => editor.registerCommand(RESET_MARKDOWN_DRAFT_COMMAND, handleDraftReset, COMMAND_PRIORITY_HIGH),
        [editor, handleDraftReset]);

    const handleSelectOption = useCallback((
        option: MarkdownPlaceholderOption,
        textNodeContainingQuery: TextNode | null,
        closeMenu: () => void,
    ) => {
        if (!textNodeContainingQuery) return

        textNodeContainingQuery.setTextContent(formatActionPlaceholder(option.placeholder.name))
        textNodeContainingQuery.selectEnd()
        closeMenu()
    }, [])

    const renderMenu = useCallback<MenuRenderFn<MarkdownPlaceholderOption>>((anchorElementRef, itemProps) => {
        if (!anchorElementRef.current || !anchorRect || itemProps.options.length === 0) return null

        return (
            <MarkdownPlaceholderMenu
                anchorRect={anchorRect}
                onHighlight={itemProps.setHighlightedIndex}
                onSelect={itemProps.selectOptionAndCleanUp}
                options={itemProps.options}
                selectedIndex={itemProps.selectedIndex}
            />
        )
    }, [anchorRect])

    return (
        <LexicalTypeaheadMenuPlugin<MarkdownPlaceholderOption>
            menuRenderFn={renderMenu}
            onClose={handleClose}
            onOpen={handleOpen}
            onQueryChange={handleQueryChange}
            onSelectOption={handleSelectOption}
            options={options}
            parent={overlayContainer ?? undefined}
            triggerFn={triggerFn}
        />
    )
}
