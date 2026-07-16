import {
    BlockTypeSelect, BoldItalicUnderlineToggles, CreateLink, InsertCodeBlock, InsertImage, InsertTable,
    InsertThematicBreak, ListsToggle, Separator, UndoRedo,
} from '@mdxeditor/editor'
import type { ReactNode } from 'react'
import type { ActionPlaceholder } from '../../data/action_placeholders'
import { MarkdownPlaceholderToolbarControl } from './markdown_placeholder_toolbar_control'

interface MarkdownFormatToolbarControlsProps {
    endControls?: ReactNode
    overlayContainer?: HTMLElement | null
    placeholders?: readonly ActionPlaceholder[]
    undoRedoControls?: ReactNode
}

/** The full formatting command set supported by the shared markdown editor. */
export function MarkdownFormatToolbarControls(props: MarkdownFormatToolbarControlsProps = {}) {
    const { endControls, overlayContainer, placeholders = [], undoRedoControls } = props

    return (
        <>
            {undoRedoControls ?? <UndoRedo />}
            <Separator />
            <BoldItalicUnderlineToggles />
            <Separator />
            <ListsToggle />
            <BlockTypeSelect />
            <Separator />
            <CreateLink />
            <InsertImage />
            <Separator />
            <InsertTable />
            <InsertThematicBreak />
            <InsertCodeBlock />
            {placeholders.length > 0 ? (
                <>
                    <Separator />
                    <MarkdownPlaceholderToolbarControl overlayContainer={overlayContainer} placeholders={placeholders} />
                </>
            ) : null}
            {endControls}
        </>
    )
}
