export const INVALID_LOCAL_FILE_LINK_ERROR: 'invalid-local-file-link'
export const LOCAL_FILE_LINK_OUTSIDE_REPOSITORY_ERROR: 'local-file-link-outside-repository'

export type LocalFileLinkErrorCode = typeof INVALID_LOCAL_FILE_LINK_ERROR | typeof LOCAL_FILE_LINK_OUTSIDE_REPOSITORY_ERROR

export function localFileLinkError(code: LocalFileLinkErrorCode, message: string): Error & { code: LocalFileLinkErrorCode }
export function isLocalFileLinkError(error: unknown, code: LocalFileLinkErrorCode): error is Error & { code: LocalFileLinkErrorCode }
