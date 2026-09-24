import { Box, Typography } from '@mui/material'
import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import {
    MARKDOWN_SECTIONS,
    type MarkdownSection,
    type MarkdownSectionStyle,
    type MarkdownStyleConfig,
} from '../../theme/theme_config'
import { buildMarkdownContentSx } from '../editor/markdown_style_sx'
import { MarkdownSectionEditor } from './markdown_section_editor'

const MARKDOWN_SECTION_LABELS: Record<MarkdownSection, string> = {
    title1: 'Title 1',
    title2: 'Title 2',
    title3: 'Title 3',
    body: 'Body',
    caption: 'Caption',
    link: 'Links',
    list: 'Lists',
    blockquote: 'Blockquotes',
    inlineCode: 'Inline code',
    codeBlock: 'Code blocks',
    table: 'Tables',
}

const SECTION_ATTRIBUTE = 'data-markdown-section'
const SECTION_SELECTOR = `[${SECTION_ATTRIBUTE}]`
const OPEN_KEYS = ['Enter', ' ']

const sectionAffordanceSx = {
    [`& ${SECTION_SELECTOR}`]: { cursor: 'pointer' },
    [`& ${SECTION_SELECTOR}:hover, & ${SECTION_SELECTOR}:focus-visible`]: {
        outline: '2px solid',
        outlineColor: 'primary.main',
    },
}

interface MarkdownStylePreviewProps {
    config: MarkdownStyleConfig
    onSectionChange: (section: MarkdownSection, style: MarkdownSectionStyle) => void
}

interface SelectedSection {
    anchorElement: HTMLElement
    section: MarkdownSection
}

/** Resolves the innermost tagged preview element around the event target. */
function findSelectedSection(target: EventTarget): SelectedSection | null {
    if (!(target instanceof Element)) return null
    const anchorElement = target.closest<HTMLElement>(SECTION_SELECTOR)
    if (!anchorElement) return null
    const section = MARKDOWN_SECTIONS.find((candidate) => candidate === anchorElement.getAttribute(SECTION_ATTRIBUTE))
    if (!section) return null

    return { anchorElement, section }
}

/** Returns the attributes that make a preview element selectable for its section. */
function sectionProps(section: MarkdownSection) {
    return { [SECTION_ATTRIBUTE]: section, 'aria-label': `Edit ${MARKDOWN_SECTION_LABELS[section]} style`, tabIndex: 0 }
}

export function MarkdownStylePreview(props: MarkdownStylePreviewProps) {
    const { config, onSectionChange } = props
    const contentSx = useMemo(() => buildMarkdownContentSx(config), [config])
    const [selectedSection, setSelectedSection] = useState<SelectedSection | null>(null)

    const handleContentClick = (event: MouseEvent<HTMLElement>) => {
        const nextSelectedSection = findSelectedSection(event.target)
        if (!nextSelectedSection) return

        setSelectedSection(nextSelectedSection)
    }

    const handleContentKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (!OPEN_KEYS.includes(event.key)) return
        const nextSelectedSection = findSelectedSection(event.target)
        if (!nextSelectedSection) return

        event.preventDefault()
        setSelectedSection(nextSelectedSection)
    }

    const handleEditorClose = () => {
        setSelectedSection(null)
    }

    return (
        <Box aria-label="Markdown style preview" sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, ...contentSx }}>
            <Typography variant="subtitle2">Preview</Typography>
            <Typography color="text.secondary" gutterBottom variant="body2">Click an element to edit its style.</Typography>
            <Box className="mdxeditor-content" onClick={handleContentClick} onKeyDown={handleContentKeyDown} sx={sectionAffordanceSx}>
                <h1 {...sectionProps('title1')}>Primary heading</h1>
                <h2 {...sectionProps('title2')}>Section heading</h2>
                <h3 {...sectionProps('title3')}>Detail heading</h3>
                <p {...sectionProps('body')}>
                    Body text with an <a {...sectionProps('link')}>example link</a> and <code {...sectionProps('inlineCode')}>inline code</code>.
                </p>
                <ul {...sectionProps('list')}>
                    <li>First list item</li>
                    <li>Second list item</li>
                </ul>
                <blockquote {...sectionProps('blockquote')}><p>A blockquote provides supporting context.</p></blockquote>
                <pre {...sectionProps('codeBlock')}><code>{"const example = 'code block'"}</code></pre>
                <table {...sectionProps('table')}>
                    <thead><tr><th>Column</th><th>Value</th></tr></thead>
                    <tbody><tr><td>Example</td><td>Content</td></tr></tbody>
                </table>
                <small {...sectionProps('caption')}>Caption text</small>
            </Box>
            {selectedSection ? (
                <MarkdownSectionEditor
                    anchorElement={selectedSection.anchorElement}
                    label={MARKDOWN_SECTION_LABELS[selectedSection.section]}
                    onChange={onSectionChange}
                    onClose={handleEditorClose}
                    section={selectedSection.section}
                    style={config[selectedSection.section]}
                />
            ) : null}
        </Box>
    )
}
