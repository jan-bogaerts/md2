export const READ_ONLY_PROJECT_ERROR = 'Public GitHub repository is read-only'

/** Owns current project access mode and guards mutation entry points. */
export class ProjectAccessService extends EventTarget {
    private readOnly = false

    getSnapshot() {
        return this.readOnly
    }

    setReadOnly(readOnly: boolean) {
        if (this.readOnly === readOnly) return

        this.readOnly = readOnly
        this.dispatchEvent(new Event('changed'))
    }

    requireWritable() {
        if (this.readOnly) throw new Error(READ_ONLY_PROJECT_ERROR)
    }
}

export const projectAccessService = new ProjectAccessService()
