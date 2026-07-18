import { dataService } from '../../services/data/data_service'

const BLOCKED_SVG_CONTENT_PATTERN = /<\s*(script|foreignObject)\b|on[a-z]+\s*=|javascript:/iu
const DATA_URI_SAFE_CHARACTERS = /[\u007F-\uFFFF]/gu
const INLINE_SVG_PATTERN = /^\s*<svg[\s>]/iu
const PROJECT_ICON_PATH_PATTERN = /^[A-Za-z0-9._/-]+\.(svg|png|jpe?g|gif|webp)$/iu

export interface ActionIconSource {
    dataUri: string | null
}

export function sanitizeInlineSvg(icon: string) {
    const trimmed = icon.trim()
    if (!INLINE_SVG_PATTERN.test(trimmed)) return null
    if (BLOCKED_SVG_CONTENT_PATTERN.test(trimmed)) return null

    return trimmed
}

function svgToDataUri(svg: string) {
    const asciiSvg = svg.replace(DATA_URI_SAFE_CHARACTERS, '')

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(asciiSvg)}`
}

function assetToDataUri(content: string, contentType: string) {
    return `data:${contentType};base64,${content}`
}

function isProjectIconPath(icon: string) {
    if (icon.includes('..')) return false
    if (icon.startsWith('/') || /^[a-z]+:/iu.test(icon)) return false

    return PROJECT_ICON_PATH_PATTERN.test(icon)
}

export async function resolveActionIcon(icon: string | null): Promise<ActionIconSource> {
    if (!icon) return { dataUri: null }

    const sanitizedSvg = sanitizeInlineSvg(icon)
    if (sanitizedSvg) return { dataUri: svgToDataUri(sanitizedSvg) }
    if (!isProjectIconPath(icon)) return { dataUri: null }

    try {
        const asset = await dataService.projectLoading.loadProjectAsset(icon)

        return { dataUri: assetToDataUri(asset.content, asset.contentType) }
    } catch {
        return { dataUri: null }
    }
}
