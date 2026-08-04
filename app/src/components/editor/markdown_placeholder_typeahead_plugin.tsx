import {
    LexicalTypeaheadMenuPlugin,
    type MenuRenderFn,
    type TriggerFn,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { useCellValue } from '@mdxeditor/editor'
import type { TextNode } from 'lexical'
import { createPortal } from 'react-dom'
import { useCallback, useMemo, useState } from 'react'
import type { ActionPlaceholder } from '../../data/action_placeholders'
import { formatActionPlaceholder } from '../../data/action_placeholders'
import { markdownPlaceholderConfig$ } from './markdown_placeholder_config_cell'
import { MarkdownPlaceholderOption } from './markdown_placeholder_option'
import { MarkdownPlaceholderMenu } from './markdown_placeholder_menu'
import { matchPlaceholderTrigger } from './markdown_placeholder_trigger'

function placeholderMatchesQuery(placeholder: ActionPlaceholder, query: string) {
    return placeholder.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
}

/** Shows supported placeholders at the caret after the user types `{{`. */
export function MarkdownPlaceholderTypeaheadPlugin() {
    const { overlayContainer, placeholders } = useCellValue(markdownPlaceholderConfig$)
    const [query, setQuery] = useState('')
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
        if (!anchorElementRef.current || itemProps.options.length === 0) return null

        return createPortal(
            <MarkdownPlaceholderMenu
                onHighlight={itemProps.setHighlightedIndex}
                onSelect={itemProps.selectOptionAndCleanUp}
                options={itemProps.options}
                selectedIndex={itemProps.selectedIndex}
            />,
            anchorElementRef.current,
        )
    }, [])

    return (
        <LexicalTypeaheadMenuPlugin<MarkdownPlaceholderOption>
            menuRenderFn={renderMenu}
            onQueryChange={handleQueryChange}
            onSelectOption={handleSelectOption}
            options={options}
            parent={overlayContainer ?? undefined}
            triggerFn={triggerFn}
        />
    )
}
