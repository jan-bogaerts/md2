/**
 * Path helpers for imported binary assets. Assets are stored beside their target card so the
 * card can reference them with a relative link, and never allowed to escape the card's folder.
 */

const SUPPORTED_ASSET_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

function normalizeSeparators(path: string) {
    return path.replace(/\\/gu, '/')
}

/** The folder a card lives in, relative to the project root. Empty for a root-level card. */
export function cardFolder(cardPath: string) {
    const normalized = normalizeSeparators(cardPath)
    const lastSlash = normalized.lastIndexOf('/')

    return lastSlash === -1 ? '' : normalized.slice(0, lastSlash)
}

/** True when the file name is a bare image file name that stays inside its folder. */
export function isSafeAssetFileName(fileName: string) {
    const normalized = normalizeSeparators(fileName)
    if (normalized.length === 0) return false
    if (normalized.includes('/')) return false
    if (normalized === '.' || normalized === '..') return false

    return true
}

/** True when the file name has a supported image extension. */
export function isSupportedAssetFileName(fileName: string) {
    const lower = fileName.toLowerCase()

    return SUPPORTED_ASSET_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/**
 * Resolve where an imported asset is written: beside the target card. Rejects file names that
 * would escape the card folder or that are not supported image types.
 */
export function resolveCardAssetPath(cardPath: string, fileName: string) {
    if (!isSafeAssetFileName(fileName)) throw new Error(`Unsafe asset file name: ${fileName}`)
    if (!isSupportedAssetFileName(fileName)) throw new Error(`Unsupported asset file type: ${fileName}`)

    const folder = cardFolder(cardPath)

    return folder.length > 0 ? `${folder}/${fileName}` : fileName
}
