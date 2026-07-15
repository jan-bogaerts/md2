import {
    BlockTypeSelect, BoldItalicUnderlineToggles, CreateLink, InsertCodeBlock, InsertImage, InsertTable,
    InsertThematicBreak, ListsToggle, Separator, UndoRedo,
} from '@mdxeditor/editor'
import type { ReactNode } from 'react'

interface MarkdownFormatToolbarControlsProps {
    endControls?: ReactNode
    undoRedoControls?: ReactNode
}

/** The full formatting command set supported by the shared markdown editor. */
export function MarkdownFormatToolbarControls(props: MarkdownFormatToolbarControlsProps = {}) {
    const { endControls, undoRedoControls } = props

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
            {endControls}
        </>
    )
}
