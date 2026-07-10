import { Box } from '@mui/material'

export const MARKDOWN_FORMAT_TOOLBAR_HOST_ID = 'markdown-format-toolbar-host'

/** Menu target that receives the active MDXEditor toolbar through a portal. */
export function MarkdownFormatToolbarHost() {
    return (
        <Box
            id={MARKDOWN_FORMAT_TOOLBAR_HOST_ID}
            sx={{
                alignItems: 'center',
                display: 'flex',
                minHeight: 40,
                '& .mdxeditor-toolbar': {
                    background: 'transparent',
                    border: 0,
                    p: 0,
                },
            }}
        />
    )
}
