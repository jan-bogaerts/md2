import { Box } from '@mui/material'
import {
    MDXEditor, codeBlockPlugin, codeMirrorPlugin,
    headingsPlugin, imagePlugin, linkDialogPlugin, linkPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin,
    tablePlugin, thematicBreakPlugin, toolbarPlugin,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import type { ReactNode } from 'react'
import { useAppTheme } from '../../theme/use_app_theme'
import { MarkdownFormatToolbarControls } from './markdown_format_toolbar_controls'
import { buildMarkdownContentSx } from './markdown_style_sx'

const DEFAULT_CODE_LANGUAGE = ''
const CODE_BLOCK_LANGUAGES = { '': 'Plain text', js: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', bash: 'Shell' }

interface MarkdownEditorProps {
    markdown: string
    onChange: (markdown: string) => void
    overlayContainer?: HTMLElement | null
    stickyToolbar?: boolean
    toolbarContents?: () => ReactNode
}

/**
 * Reusable MDXEditor surface for card bodies and files (F-007). Emits markdown
 * text through `onChange`; persistence stays with the caller. Callers pass a
 * `key` (the card/file path) so switching targets remounts with fresh content.
 * On mobile the formatting toolbar stays sticky at the top of the scroll area.
 */
export function MarkdownEditor(props: MarkdownEditorProps) {
    const { markdown, onChange, overlayContainer, stickyToolbar = false, toolbarContents = MarkdownFormatToolbarControls } = props
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
                overlayContainer={overlayContainer}
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
                    toolbarPlugin({ toolbarContents }),
                ]}
            />
        </Box>
    )
}
