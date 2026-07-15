/** Convert a filesystem path to forward-slash form, for stable cross-platform comparisons and storage. */
export function normalizePath(filePath) {
    return filePath.replace(/\\/gu, '/')
}
