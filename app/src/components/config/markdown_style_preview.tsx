import { Box, Typography } from '@mui/material'
import { useMemo } from 'react'
import type { MarkdownStyleConfig } from '../../theme/theme_config'
import { buildMarkdownContentSx } from '../editor/markdown_style_sx'

interface MarkdownStylePreviewProps {
    config: MarkdownStyleConfig
}

export function MarkdownStylePreview(props: MarkdownStylePreviewProps) {
    const { config } = props
    const contentSx = useMemo(() => buildMarkdownContentSx(config), [config])

    return (
        <Box aria-label="Markdown style preview" sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, ...contentSx }}>
            <Typography gutterBottom variant="subtitle2">Preview</Typography>
            <Box className="mdxeditor-content">
                <h1>Primary heading</h1>
                <h2>Section heading</h2>
                <h3>Detail heading</h3>
                <p>Body text with an <a href="#markdown-preview">example link</a> and <code>inline code</code>.</p>
                <ul>
                    <li>First list item</li>
                    <li>Second list item</li>
                </ul>
                <blockquote><p>A blockquote provides supporting context.</p></blockquote>
                <pre><code>{"const example = 'code block'"}</code></pre>
                <table>
                    <thead><tr><th>Column</th><th>Value</th></tr></thead>
                    <tbody><tr><td>Example</td><td>Content</td></tr></tbody>
                </table>
                <small>Caption text</small>
            </Box>
        </Box>
    )
}
