import type { ReactNode } from 'react'
import type { ActionPlaceholder } from '../../data/action_placeholders'

/** Active document supplied to TextView's lifetime-stable Markdown editor. */
export interface MarkdownDocumentConfig {
    documentId: string
    flushOnBlur?: boolean
    markdown: string
    onChange: (markdown: string) => void
    onEdit?: (markdown: string) => void
    ownerPath: string
    placeholders?: readonly ActionPlaceholder[]
    stickyToolbar?: boolean
    toolbarContents?: () => ReactNode
}

/** Documents owned by one structured editor and its currently visible document. */
export interface MarkdownDocumentOwnerConfig {
    activeDocument: MarkdownDocumentConfig | null
    documentIds: string[]
    ownerPath: string
}
