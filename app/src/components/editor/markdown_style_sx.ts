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
        lineHeight: section.lineHeight,
        textDecoration: section.formatting.underline ? 'underline' : 'none',
    }
}

function sectionSpacing(section: MarkdownSectionStyle) {
    return { marginBottom: section.marginBottom, marginTop: section.marginTop }
}

function sectionStyle(section: MarkdownSectionStyle) {
    return { ...sectionTypography(section), ...sectionSpacing(section) }
}

/** Builds scoped markdown content typography for MDXEditor and matching previews. */
export function buildMarkdownContentSx(markdownStyleConfig: MarkdownStyleConfig): SxProps<Theme> {
    return {
        '& .mdxeditor-content h1': sectionStyle(markdownStyleConfig.title1),
        '& .mdxeditor-content h2': sectionStyle(markdownStyleConfig.title2),
        '& .mdxeditor-content h3': sectionStyle(markdownStyleConfig.title3),
        '& .mdxeditor-content p': sectionStyle(markdownStyleConfig.body),
        '& .mdxeditor-content small, & .mdxeditor-content figcaption': sectionStyle(markdownStyleConfig.caption),
        '& .mdxeditor-content a': sectionStyle(markdownStyleConfig.link),
        '& .mdxeditor-content ul, & .mdxeditor-content ol, & .mdxeditor-content li': sectionTypography(markdownStyleConfig.list),
        '& .mdxeditor-content ul, & .mdxeditor-content ol': sectionSpacing(markdownStyleConfig.list),
        '& .mdxeditor-content blockquote, & .mdxeditor-content blockquote p': sectionTypography(markdownStyleConfig.blockquote),
        '& .mdxeditor-content blockquote': sectionSpacing(markdownStyleConfig.blockquote),
        '& .mdxeditor-content :not(pre) > code': sectionStyle(markdownStyleConfig.inlineCode),
        '& .mdxeditor-content pre, & .mdxeditor-content pre code': sectionTypography(markdownStyleConfig.codeBlock),
        '& .mdxeditor-content pre': sectionSpacing(markdownStyleConfig.codeBlock),
        '& .mdxeditor-content table, & .mdxeditor-content th, & .mdxeditor-content td': sectionTypography(markdownStyleConfig.table),
        '& .mdxeditor-content table': sectionSpacing(markdownStyleConfig.table),
    }
}
