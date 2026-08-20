import {
    BlockTypeSelect, BoldItalicUnderlineToggles, CreateLink, InsertCodeBlock, InsertImage, InsertTable,
    InsertThematicBreak, ListsToggle, Separator, UndoRedo,
} from '@mdxeditor/editor'
import type { ReactNode } from 'react'
import type { ActionPlaceholder } from '../../data/action_placeholders'
import { MarkdownListIndentToolbarControls } from './markdown_list_indent_toolbar_controls'
import { MarkdownLocalTextSearchToolbarControl } from './markdown_local_text_search_toolbar_control'
import { MarkdownPlaceholderToolbarControl } from './markdown_placeholder_toolbar_control'

interface MarkdownFormatToolbarControlsProps {
    endControls?: ReactNode
    overlayContainer?: HTMLElement | null
    placeholders?: readonly ActionPlaceholder[]
    readOnly?: boolean
    undoRedoControls?: ReactNode
}

/** The full formatting command set supported by the shared markdown editor. */
export function MarkdownFormatToolbarControls(props: MarkdownFormatToolbarControlsProps = {}) {
    const { endControls, overlayContainer, placeholders = [], readOnly = false, undoRedoControls } = props

    return (
        <>
            {!readOnly ? (
                <>
                    {undoRedoControls ?? <UndoRedo />}
                    <Separator />
                    <BoldItalicUnderlineToggles />
                    <Separator />
                    <ListsToggle />
                    <MarkdownListIndentToolbarControls />
                    <BlockTypeSelect />
                    <Separator />
                    <CreateLink />
                    <InsertImage />
                    <Separator />
                    <InsertTable />
                    <InsertThematicBreak />
                    <InsertCodeBlock />
                    <Separator />
                </>
            ) : null}
            <MarkdownLocalTextSearchToolbarControl />
            {!readOnly && placeholders.length > 0 ? (
                <>
                    <Separator />
                    <MarkdownPlaceholderToolbarControl overlayContainer={overlayContainer} placeholders={placeholders} />
                </>
            ) : null}
            {endControls}
        </>
    )
}
