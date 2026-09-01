const BLOCKED_ELEMENTS = new Set([
    'a', 'animate', 'animatemotion', 'animatetransform', 'audio', 'discard', 'embed', 'foreignobject', 'iframe',
    'image', 'link', 'object', 'script', 'set', 'style', 'video',
])
const BLOCKED_ATTRIBUTES = new Set(['src', 'xml:base'])
const DOCTYPE_PATTERN = /^\s*<!DOCTYPE[^[>]*>/iu
const ENTITY_PATTERN = /<!ENTITY/iu
/** `url(` followed by anything other than a same-document `#fragment` reference. */
const EXTERNAL_URL_PATTERN = /@import|url\(\s*['"]?(?!#)/iu

function isExternalReference(value: string) {
    const trimmed = value.trim()

    return trimmed.length > 0 && !trimmed.startsWith('#')
}

function isUnsafeAttribute(name: string, value: string) {
    if (name.startsWith('on') || BLOCKED_ATTRIBUTES.has(name)) return true
    if (name === 'href' || name === 'xlink:href') return isExternalReference(value)

    return EXTERNAL_URL_PATTERN.test(value)
}

/**
 * Parses agent-generated standalone SVG as XML and returns inline markup that cannot execute code
 * or load external resources, with drill-down items marked up as accessible buttons.
 */
export function sanitizeDiagramSvg(svg: string) {
    if (ENTITY_PATTERN.test(svg)) throw new Error('Unsafe SVG: entity declarations are not allowed')
    const document = new DOMParser().parseFromString(svg.replace(DOCTYPE_PATTERN, ''), 'image/svg+xml')
    if (document.querySelector('parsererror')) throw new Error('Invalid SVG XML')
    const root = document.documentElement
    if (root.localName.toLowerCase() !== 'svg') throw new Error('Diagram output must be a standalone SVG')

    const itemIds = new Set<string>()
    for (const element of [root, ...root.querySelectorAll('*')]) {
        if (BLOCKED_ELEMENTS.has(element.localName.toLowerCase())) {
            element.remove()
            continue
        }
        for (const { name, value } of [...element.attributes]) {
            if (isUnsafeAttribute(name.toLowerCase(), value)) element.removeAttribute(name)
        }
        const itemId = element.getAttribute('data-diagram-id')?.trim() ?? ''
        const itemLabel = element.getAttribute('data-diagram-label')?.trim() ?? ''
        if (itemId.length === 0 && itemLabel.length === 0) continue
        if (itemId.length === 0 || itemLabel.length === 0) throw new Error('Interactive SVG items require data-diagram-id and data-diagram-label')
        if (itemIds.has(itemId)) throw new Error(`Duplicate interactive SVG ID: ${itemId}`)
        itemIds.add(itemId)
        if (!element.hasAttribute('aria-label')) element.setAttribute('aria-label', itemLabel)
        element.setAttribute('role', 'button')
        element.setAttribute('tabindex', '0')
    }

    return new XMLSerializer().serializeToString(root)
}
