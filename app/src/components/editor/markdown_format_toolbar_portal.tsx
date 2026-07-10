import { createPortal } from 'react-dom'
import { MARKDOWN_FORMAT_TOOLBAR_HOST_ID } from './markdown_format_toolbar_host'
import { MarkdownFormatToolbarControls } from './markdown_format_toolbar_controls'

interface MarkdownFormatToolbarPortalProps {
    stickyToolbar: boolean
}

function findToolbarHost() {
    return document.getElementById(MARKDOWN_FORMAT_TOOLBAR_HOST_ID)
}

/** Renders editor formatting controls locally, or into the shell menu host on desktop. */
export function MarkdownFormatToolbarPortal(props: MarkdownFormatToolbarPortalProps) {
    const { stickyToolbar } = props
    const host = findToolbarHost()

    if (stickyToolbar || !host) return <MarkdownFormatToolbarControls />

    return createPortal(<MarkdownFormatToolbarControls />, host)
}
