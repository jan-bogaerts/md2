import { Box } from '@mui/material'
import {
    BlockTypeSelect, BoldItalicUnderlineToggles, CreateLink, InsertCodeBlock, InsertImage, InsertTable,
    InsertThematicBreak, ListsToggle, MDXEditor, Separator, UndoRedo, codeBlockPlugin, codeMirrorPlugin,
    headingsPlugin, imagePlugin, linkDialogPlugin, linkPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin,
    tablePlugin, thematicBreakPlugin, toolbarPlugin,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { useAppTheme } from '../../theme/use_app_theme'
import { buildMarkdownContentSx } from './markdown_style_sx'

const DEFAULT_CODE_LANGUAGE = ''
const CODE_BLOCK_LANGUAGES = { '': 'Plain text', js: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', bash: 'Shell' }

interface MarkdownEditorProps {
    markdown: string
    onChange: (markdown: string) => void
    stickyToolbar?: boolean
}

/**
 * Reusable MDXEditor surface for card bodies and files (F-007). Emits markdown
 * text through `onChange`; persistence stays with the caller. Callers pass a
 * `key` (the card/file path) so switching targets remounts with fresh content.
 * On mobile the formatting toolbar stays sticky at the top of the scroll area.
 */
export function MarkdownEditor(props: MarkdownEditorProps) {
    const { markdown, onChange, stickyToolbar = false } = props
    const { markdownStyleConfig } = useAppTheme()
    const markdownContentSx = buildMarkdownContentSx(markdownStyleConfig)
    const stickySx = stickyToolbar
        ? { '& .mdxeditor-toolbar': { position: 'sticky', top: 0, zIndex: 1 } }
        : undefined
    const editorSx = { ...markdownContentSx, ...stickySx }

    return (
        <Box data-sticky-toolbar={stickyToolbar} sx={editorSx}>
            <MDXEditor
                contentEditableClassName="mdxeditor-content"
                markdown={markdown}
                onChange={onChange}
                plugins={[
                    headingsPlugin(),
                    listsPlugin(),
                    quotePlugin(),
                    thematicBreakPlugin(),
                    linkPlugin(),
                    linkDialogPlugin(),
                    imagePlugin(),
                    tablePlugin(),
                    codeBlockPlugin({ defaultCodeBlockLanguage: DEFAULT_CODE_LANGUAGE }),
                    codeMirrorPlugin({ codeBlockLanguages: CODE_BLOCK_LANGUAGES }),
                    markdownShortcutPlugin(),
                    toolbarPlugin({
                        toolbarContents: () => (
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
                        ),
                    }),
                ]}
            />
        </Box>
    )
}
