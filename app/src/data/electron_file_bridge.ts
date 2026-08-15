export interface ElectronFileBridge {
    getPathForFile(file: File): string
}

declare global {
    interface Window {
        md2Files?: ElectronFileBridge
    }
}

export function getElectronFileBridge() {
    return window.md2Files ?? null
}

/** Returns Electron's trusted original path, or null when unavailable in this runtime. */
export function getOriginalFilePath(file: File) {
    const path = getElectronFileBridge()?.getPathForFile(file).trim() ?? ''

    return path.length > 0 ? path : null
}

/** Resolves every trusted original path, returning null when any file lacks one. */
export function getOriginalFilePaths(files: File[]) {
    const paths = files.map(getOriginalFilePath)
    if (paths.some((path) => path === null)) return null

    return paths as string[]
}
