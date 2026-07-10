import {
    BlockTypeSelect, BoldItalicUnderlineToggles, CreateLink, InsertCodeBlock, InsertImage, InsertTable,
    InsertThematicBreak, ListsToggle, Separator, UndoRedo,
} from '@mdxeditor/editor'

/** The full formatting command set supported by the shared markdown editor. */
export function MarkdownFormatToolbarControls() {
    return (
        <>
            <UndoRedo />
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
        </>
    )
}
