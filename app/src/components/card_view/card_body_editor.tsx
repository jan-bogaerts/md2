import type { ProjectCard } from '../../data/data_types'
import { MarkdownEditor } from '../editor/markdown_editor'

interface CardBodyEditorProps {
    card: ProjectCard
    isMobile?: boolean
    onBodyChange: (path: string, body: string) => void
}

/**
 * Body editing surface for a card. Renders the shared markdown editor (F-007);
 * edits flow up as markdown through `onBodyChange`, and `DataService` preserves
 * the frontmatter/header block via the shared parsing service.
 */
export function CardBodyEditor(props: CardBodyEditorProps) {
    const { card, isMobile = false, onBodyChange } = props

    return (
        <MarkdownEditor
            key={card.path}
            markdown={card.content}
            onChange={(body) => onBodyChange(card.path, body)}
            stickyToolbar={isMobile}
        />
    )
}
