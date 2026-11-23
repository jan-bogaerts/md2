import { routeJsonLink } from '../../../services/json/json_link_navigation'

const EXTERNAL_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** Handles the existing link-dialog Open action without changing editor link-click behavior. */
export function openMarkdownLink(url: string, sourcePath: string | null, anchorElement: HTMLElement | null) {
    if (sourcePath && anchorElement && routeJsonLink(sourcePath, url, anchorElement)) return

    try {
        if (EXTERNAL_LINK_PROTOCOLS.has(new URL(url).protocol)) void window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
        return
    }
}
