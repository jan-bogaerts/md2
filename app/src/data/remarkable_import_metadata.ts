import type { RemarkableConnectionSettings, RemarkableDeviceFile } from './remarkable_bridge'

/**
 * Project-local record of which Remarkable files have been imported, so the UI can mark device
 * files as never-imported, changed-since-import or unchanged. Stored beside the working folder.
 */

export const REMARKABLE_METADATA_FILENAME = '.remarkable-import.json'
const METADATA_VERSION = 1

export type RemarkableFileStatus = 'changed' | 'imported' | 'new'

export interface RemarkableImportRecord {
    /** ISO timestamp of the device file at the moment it was imported. */
    importedModifiedTime: string
    /** ISO timestamp of when the import ran. */
    importedAt: string
    /** Project-relative path the asset was written to. */
    localPath: string
}

export interface RemarkableDeviceRecord {
    files: Record<string, RemarkableImportRecord>
}

export interface RemarkableImportMetadata {
    devices: Record<string, RemarkableDeviceRecord>
    version: number
}

export interface RemarkableFileDiff {
    file: RemarkableDeviceFile
    status: RemarkableFileStatus
}

export function remarkableMetadataPath(workingFolder: string) {
    const normalized = workingFolder.replace(/\\/gu, '/').replace(/\/$/u, '')

    return normalized.length > 0 ? `${normalized}/${REMARKABLE_METADATA_FILENAME}` : REMARKABLE_METADATA_FILENAME
}

/** Stable per-device key so import history is tracked separately for each device. */
export function remarkableDeviceKey(settings: RemarkableConnectionSettings) {
    return `${settings.username}@${settings.host}:${settings.port}`
}

function emptyMetadata(): RemarkableImportMetadata {
    return { devices: {}, version: METADATA_VERSION }
}

export function parseImportMetadata(content: string | null): RemarkableImportMetadata {
    if (!content || content.trim().length === 0) return emptyMetadata()

    const payload = JSON.parse(content) as Partial<RemarkableImportMetadata>
    if (!payload || typeof payload !== 'object' || typeof payload.devices !== 'object' || payload.devices === null) {
        throw new Error('Malformed Remarkable import metadata')
    }

    return { devices: payload.devices as Record<string, RemarkableDeviceRecord>, version: METADATA_VERSION }
}

export function serializeImportMetadata(metadata: RemarkableImportMetadata) {
    return `${JSON.stringify(metadata, null, 2)}\n`
}

function statusFor(file: RemarkableDeviceFile, record: RemarkableImportRecord | undefined): RemarkableFileStatus {
    if (!record) return 'new'

    const deviceTime = Date.parse(file.modifiedTime)
    const importedTime = Date.parse(record.importedModifiedTime)
    if (Number.isNaN(deviceTime) || Number.isNaN(importedTime)) {
        return file.modifiedTime === record.importedModifiedTime ? 'imported' : 'changed'
    }

    return deviceTime > importedTime ? 'changed' : 'imported'
}

/** Classify each device file against the persisted import history for a device. */
export function diffDeviceFiles(
    files: RemarkableDeviceFile[],
    metadata: RemarkableImportMetadata,
    deviceKey: string,
): RemarkableFileDiff[] {
    const deviceRecord = metadata.devices[deviceKey]

    return files.map((file) => ({ file, status: statusFor(file, deviceRecord?.files[file.path]) }))
}

export interface RemarkableImportEntry {
    devicePath: string
    localPath: string
    modifiedTime: string
}

/** Return new metadata with the given imports recorded for a device. Does not mutate the input. */
export function recordImports(
    metadata: RemarkableImportMetadata,
    deviceKey: string,
    entries: RemarkableImportEntry[],
    importedAt: string,
): RemarkableImportMetadata {
    const existing = metadata.devices[deviceKey]?.files ?? {}
    const files: Record<string, RemarkableImportRecord> = { ...existing }
    for (const entry of entries) {
        files[entry.devicePath] = { importedAt, importedModifiedTime: entry.modifiedTime, localPath: entry.localPath }
    }

    return { devices: { ...metadata.devices, [deviceKey]: { files } }, version: METADATA_VERSION }
}
