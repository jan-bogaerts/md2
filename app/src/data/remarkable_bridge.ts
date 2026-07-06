/**
 * Preload bridge for the Remarkable device. React calls these explicit methods; the Electron
 * preload owns the SSH transport, remote listing and file reads. The bridge is only present in
 * Electron local-project mode.
 */

/** SSH connection details for reaching a Remarkable device. */
export interface RemarkableConnectionSettings {
    host: string
    port: number
    username: string
    /** Password auth. Optional when a private key is used instead. */
    password?: string
    /** Path to a private key file on the local machine. Optional when a password is used. */
    privateKeyPath?: string
    /** Remote folder scanned for image files. */
    imageFolder: string
}

export interface RemarkableConnectionTestResult {
    message: string | null
    ok: boolean
}

/** An image file discovered on the device. `modifiedTime` is an ISO 8601 timestamp. */
export interface RemarkableDeviceFile {
    modifiedTime: string
    name: string
    path: string
}

export interface RemarkableImportRequest {
    paths: string[]
    settings: RemarkableConnectionSettings
}

/** A file transferred from the device, ready to be written beside a card as a base64 asset. */
export interface RemarkableImportedAsset {
    /** Base64-encoded file bytes. */
    content: string
    modifiedTime: string
    name: string
    sourcePath: string
}

export interface RemarkableBridge {
    importFiles(request: RemarkableImportRequest): Promise<RemarkableImportedAsset[]>
    listImageFiles(settings: RemarkableConnectionSettings): Promise<RemarkableDeviceFile[]>
    testConnection(settings: RemarkableConnectionSettings): Promise<RemarkableConnectionTestResult>
}

declare global {
    interface Window {
        md2Remarkable?: RemarkableBridge
    }
}

export function getRemarkableBridge() {
    return window.md2Remarkable ?? null
}

const MIN_PORT = 1
const MAX_PORT = 65535

/**
 * Validate connection settings before handing them to the bridge. Throws a user-visible error on
 * missing host/username, an out-of-range port, an empty image folder, or when no credential is set.
 */
export function validateRemarkableSettings(settings: RemarkableConnectionSettings): RemarkableConnectionSettings {
    const host = settings.host.trim()
    if (host.length === 0) throw new Error('Remarkable host is required')

    const username = settings.username.trim()
    if (username.length === 0) throw new Error('Remarkable username is required')

    if (!Number.isInteger(settings.port) || settings.port < MIN_PORT || settings.port > MAX_PORT) {
        throw new Error(`Remarkable port must be between ${MIN_PORT} and ${MAX_PORT}`)
    }

    const imageFolder = settings.imageFolder.trim()
    if (imageFolder.length === 0) throw new Error('Remarkable image folder is required')

    const hasPassword = (settings.password ?? '').length > 0
    const hasPrivateKey = (settings.privateKeyPath ?? '').trim().length > 0
    if (!hasPassword && !hasPrivateKey) throw new Error('A Remarkable password or private key path is required')

    return { ...settings, host, imageFolder, username }
}
