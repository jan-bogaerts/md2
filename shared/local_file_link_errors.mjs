/**
 * Error codes for local file links clicked in agent conversations.
 *
 * Codes survive the bridge error envelope, so the renderer can tell expected link validation
 * failures apart from unexpected launch failures.
 */

export const INVALID_LOCAL_FILE_LINK_ERROR = 'invalid-local-file-link'
export const LOCAL_FILE_LINK_OUTSIDE_REPOSITORY_ERROR = 'local-file-link-outside-repository'

/** Build an error that carries a local file link error code. */
export function localFileLinkError(code, message) {
    const error = new Error(message)
    error.code = code

    return error
}

/** True when an error carries the given local file link error code. */
export function isLocalFileLinkError(error, code) {
    return !!error && typeof error === 'object' && error.code === code
}
