import { cardFolder } from '../../data/asset_paths'
import type { ProjectAsset } from '../../data/data_types'
import { dataService } from '../data/data_service'

const PASSTHROUGH_SCHEMES = ['http:', 'https:', 'data:', 'blob:']
const FILE_SCHEME = 'file:'
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/iu
const WINDOWS_DRIVE_PATH_PATTERN = /^\/[a-z]:\//iu

function assetToDataUri(asset: ProjectAsset) {
    return `data:${asset.contentType};base64,${asset.content}`
}

/** Converts a `file:` URL written by original-location attachments back to its host path. */
function fileUrlToHostPath(src: string) {
    const url = new URL(src)
    const pathname = decodeURIComponent(url.pathname)
    if (url.host.length > 0) return `//${url.host}${pathname}`
    if (WINDOWS_DRIVE_PATH_PATTERN.test(pathname)) return pathname.slice(1)

    return pathname
}

/** Joins a card-relative image reference with the card folder, resolving `.` and `..` segments. */
function cardRelativeProjectPath(cardPath: string, src: string) {
    const folder = cardFolder(cardPath)
    const segments = folder.length > 0 ? folder.split('/') : []
    const relativeSegments = decodeURIComponent(src).replace(/\\/gu, '/').split('/')

    for (const segment of relativeSegments) {
        if (segment === '' || segment === '.') continue
        if (segment !== '..') {
            segments.push(segment)
            continue
        }
        if (segments.length === 0) throw new Error(`Image path escapes the project root: ${src}`)
        segments.pop()
    }

    return segments.join('/')
}

function loadImageAsset(cardPath: string, src: string) {
    if (src.toLowerCase().startsWith(FILE_SCHEME)) return dataService.projectLoading.loadImageFile(fileUrlToHostPath(src))

    return dataService.projectLoading.loadProjectAsset(cardRelativeProjectPath(cardPath, src))
}

/**
 * Resolves a Markdown image `src` from a card body to a source the browser can display. Relative
 * and `file:` references are loaded through storage and returned as `data:` URIs. Load failures
 * return the original `src` so the editor shows its broken-image placeholder.
 */
export async function resolveCardImageSource(cardPath: string, src: string) {
    const lowerSource = src.toLowerCase()
    if (PASSTHROUGH_SCHEMES.some((scheme) => lowerSource.startsWith(scheme))) return src
    if (!lowerSource.startsWith(FILE_SCHEME) && URL_SCHEME_PATTERN.test(src)) return src

    try {
        return assetToDataUri(await loadImageAsset(cardPath, src))
    } catch {
        return src
    }
}
