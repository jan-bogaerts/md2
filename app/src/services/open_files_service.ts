import { register } from './service_injector'

export interface OpenFileEventDetail {
    path: string
}

export interface OpenFilesSnapshot {
    activePath: string | null
    paths: string[]
}

const EMPTY_SNAPSHOT: OpenFilesSnapshot = { activePath: null, paths: [] }

function requirePath(path: string) {
    if (!path) throw new Error('Cannot track an open file without a path')
}

/** Tracks the files open in the workspace, independent of file type or active view. */
export class OpenFilesService extends EventTarget {
    private projectKey: string | null = null
    private snapshot = EMPTY_SNAPSHOT

    constructor() {
        super()
        register('openFilesService', this)
    }

    getSnapshot(): OpenFilesSnapshot {
        return this.snapshot
    }

    openFile(path: string) {
        requirePath(path)
        if (this.snapshot.paths.includes(path)) {
            this.update({ ...this.snapshot, activePath: path })

            return
        }

        this.update({ activePath: path, paths: [...this.snapshot.paths, path] })
        this.dispatchFileEvent('added', path)
    }

    activateFile(path: string) {
        requirePath(path)
        if (!this.snapshot.paths.includes(path)) return

        this.update({ ...this.snapshot, activePath: path })
    }

    closeFile(path: string) {
        requirePath(path)
        const index = this.snapshot.paths.indexOf(path)
        if (index === -1) return

        const paths = this.snapshot.paths.filter((openPath) => openPath !== path)
        const activePath = this.snapshot.activePath === path
            ? paths[index] ?? paths[index - 1] ?? null
            : this.snapshot.activePath
        this.update({ activePath, paths })
        this.dispatchFileEvent('removed', path)
    }

    replaceFilePath(fromPath: string, toPath: string) {
        requirePath(fromPath)
        requirePath(toPath)
        const index = this.snapshot.paths.indexOf(fromPath)
        if (index === -1 || fromPath === toPath) return
        if (this.snapshot.paths.includes(toPath)) throw new Error(`Cannot replace open file path with existing path: ${toPath}`)

        const paths = this.snapshot.paths.map((path) => path === fromPath ? toPath : path)
        const activePath = this.snapshot.activePath === fromPath ? toPath : this.snapshot.activePath
        this.update({ activePath, paths })
        this.dispatchFileEvent('removed', fromPath)
        this.dispatchFileEvent('added', toPath)
    }

    retainAvailableFiles(availablePaths: string[]) {
        const availablePathSet = new Set(availablePaths)
        const paths = this.snapshot.paths.filter((path) => availablePathSet.has(path))
        if (paths.length === this.snapshot.paths.length) return

        const removedPaths = this.snapshot.paths.filter((path) => !availablePathSet.has(path))
        const activePath = this.snapshot.activePath && paths.includes(this.snapshot.activePath)
            ? this.snapshot.activePath
            : paths[0] ?? null
        this.update({ activePath, paths })
        for (const path of removedPaths) this.dispatchFileEvent('removed', path)
    }

    syncProject(projectKey: string | null) {
        if (this.projectKey === projectKey) return

        this.projectKey = projectKey
        this.clear()
    }

    clear() {
        if (this.snapshot.paths.length === 0) return

        const removedPaths = this.snapshot.paths
        this.update(EMPTY_SNAPSHOT)
        for (const path of removedPaths) this.dispatchFileEvent('removed', path)
    }

    private dispatchFileEvent(name: 'added' | 'removed', path: string) {
        this.dispatchEvent(new CustomEvent<OpenFileEventDetail>(name, { detail: { path } }))
    }

    private update(snapshot: OpenFilesSnapshot) {
        if (snapshot.activePath === this.snapshot.activePath && snapshot.paths === this.snapshot.paths) return

        this.snapshot = snapshot
        this.dispatchEvent(new CustomEvent<OpenFilesSnapshot>('changed', { detail: snapshot }))
    }
}

export const openFilesService = new OpenFilesService()
