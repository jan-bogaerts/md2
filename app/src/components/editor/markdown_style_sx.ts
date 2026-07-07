import type { SxProps, Theme } from '@mui/material'
import type { MarkdownSectionStyle, MarkdownStyleConfig } from '../../theme/theme_config'

const BOLD_FONT_WEIGHT = 700
const REGULAR_FONT_WEIGHT = 400

function sectionTypography(section: MarkdownSectionStyle) {
    return {
        color: section.color,
        fontFamily: section.fontFamily,
        fontSize: section.fontSize,
        fontStyle: section.formatting.italic ? 'italic' : 'normal',
        fontWeight: section.formatting.bold ? BOLD_FONT_WEIGHT : REGULAR_FONT_WEIGHT,
    }
}

/** Builds scoped markdown content typography for MDXEditor and matching previews. */
export function buildMarkdownContentSx(markdownStyleConfig: MarkdownStyleConfig): SxProps<Theme> {
    return {
        '& .mdxeditor-content h1': sectionTypography(markdownStyleConfig.title1),
        '& .mdxeditor-content h2': sectionTypography(markdownStyleConfig.title2),
        '& .mdxeditor-content h3': sectionTypography(markdownStyleConfig.title3),
        '& .mdxeditor-content p, & .mdxeditor-content ul, & .mdxeditor-content ol, & .mdxeditor-content li': sectionTypography(markdownStyleConfig.body),
        '& .mdxeditor-content blockquote, & .mdxeditor-content small': sectionTypography(markdownStyleConfig.caption),
    }
}
