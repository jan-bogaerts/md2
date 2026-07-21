import { v4 as createUuidV4 } from 'uuid'

/** Generates a UUID v4 in secure and non-secure browser contexts. */
export function generateUuid() {
    return createUuidV4()
}
