import {
    BlockTypeSelect, BoldItalicUnderlineToggles, CreateLink, InsertCodeBlock, InsertTable,
    InsertThematicBreak, ListsToggle, Separator, UndoRedo,
} from '@mdxeditor/editor'
import type { ReactNode } from 'react'
import type { ActionPlaceholder } from '../../../data/action_placeholders'
import { MarkdownAttachmentControl } from '../attachments/markdown_attachment_control'
import { MarkdownEmojiToolbarControl } from './markdown_emoji_toolbar_control'
import { MarkdownListIndentToolbarControls } from './markdown_list_indent_toolbar_controls'
import { MarkdownLocalTextSearchToolbarControl } from '../local_search/markdown_local_text_search_toolbar_control'
import { MarkdownPlaceholderToolbarControl } from '../placeholders/markdown_placeholder_toolbar_control'

interface MarkdownFormatToolbarControlsProps {
    endControls?: ReactNode
    onAttachFiles?: (files: File[]) => void
    overlayContainer?: HTMLElement | null
    placeholders?: readonly ActionPlaceholder[]
    readOnly?: boolean
    undoRedoControls?: ReactNode
}

/** The full formatting command set supported by the shared markdown editor. */
export function MarkdownFormatToolbarControls(props: MarkdownFormatToolbarControlsProps = {}) {
    const { endControls, onAttachFiles, overlayContainer, placeholders = [], readOnly = false, undoRedoControls } = props

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
                    {onAttachFiles ? <MarkdownAttachmentControl disabled={false} onFiles={onAttachFiles} /> : null}
                    <Separator />
                    <InsertTable />
                    <InsertThematicBreak />
                    <InsertCodeBlock />
                    <MarkdownEmojiToolbarControl overlayContainer={overlayContainer} />
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
