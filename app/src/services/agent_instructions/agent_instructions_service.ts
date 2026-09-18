import type { ProjectReference, StorageService } from '../../data/data_types'
import { dialogService } from '../dialog_service'
import { register } from '../service_injector'
import type { AgentInstructionFile } from './agent_instruction_file'
import { findAgentInstructionPaths } from './agent_instruction_paths'

export const AGENT_INSTRUCTION_FILES_CHANGED_EVENT = 'filesChanged'

export interface AgentInstructionLoadError {
    message: string
    path: string | null
}

export interface AgentInstructionsSnapshot {
    errors: readonly AgentInstructionLoadError[]
    files: readonly AgentInstructionFile[]
    projectKey: string | null
}

export interface AgentInstructionFileChangedDetail {
    file: AgentInstructionFile
    previousFile: AgentInstructionFile
}

const EMPTY_SNAPSHOT: AgentInstructionsSnapshot = { errors: [], files: [], projectKey: null }

function projectKey(project: ProjectReference) {
    return `${project.id}:${project.branch}`
}

function errorMessage(error: unknown) {
    return error instanceof Error && error.message.length > 0 ? error.message : 'Unknown error'
}

export function agentInstructionFileEvent(path: string) {
    return `file:${path.toLowerCase()}`
}

/** Owns loaded agent-instruction content independently from card state. */
export class AgentInstructionsService extends EventTarget {
    private loadRevision = 0
    private snapshot = EMPTY_SNAPSHOT

    constructor() {
        super()
        register('agentInstructionsService', this)
    }

    getSnapshot() {
        return this.snapshot
    }

    getFile(path: string) {
        const lowerPath = path.toLowerCase()

        return this.snapshot.files.find((file) => file.path.toLowerCase() === lowerPath) ?? null
    }

    hasFile(path: string) {
        return this.getFile(path) !== null
    }

    setProject(project: ProjectReference) {
        const nextProjectKey = projectKey(project)
        if (this.snapshot.projectKey === nextProjectKey) return

        this.loadRevision += 1
        this.setSnapshot({ errors: [], files: [], projectKey: nextProjectKey })
    }

    clear() {
        this.loadRevision += 1
        if (this.snapshot === EMPTY_SNAPSHOT) return

        this.setSnapshot(EMPTY_SNAPSHOT)
    }

    async load(project: ProjectReference, repositoryPaths: readonly string[], storage: StorageService) {
        const nextProjectKey = projectKey(project)
        this.setProject(project)
        const loadRevision = this.loadRevision + 1
        this.loadRevision = loadRevision

        if (!storage.loadTextFile) {
            const error = { message: 'Storage does not support text-file loading', path: null }
            if (this.isCurrentLoad(nextProjectKey, loadRevision)) this.publishLoadResult(nextProjectKey, [], [error])
            dialogService.warning(`Agent instructions could not be loaded. ${error.message}`, { title: 'Project loaded with errors' })
            return
        }

        const paths = findAgentInstructionPaths(repositoryPaths)
        const results = await Promise.all(paths.map(async (path) => {
            try {
                const loadedFile = await storage.loadTextFile?.(project, path)
                if (!loadedFile) throw new Error(`No content returned for ${path}`)
                const file: AgentInstructionFile = { content: loadedFile.content, path }

                return { file, error: null }
            } catch (error) {
                const loadError = { message: errorMessage(error), path }

                return { error: loadError, file: null }
            }
        }))
        if (!this.isCurrentLoad(nextProjectKey, loadRevision)) return

        const files = results.flatMap(({ file }) => file ? [file] : [])
        const errors = results.flatMap(({ error }) => error ? [error] : [])
        for (const error of errors) {
            dialogService.warning(
                `Agent instruction ${error.path} could not be loaded and was skipped. ${error.message}`,
                {title: 'Project loaded with errors'},
            )
        }
        this.publishLoadResult(nextProjectKey, files, errors)
    }

    updateContent(path: string, content: string, beforeNotify?: (file: AgentInstructionFile) => void) {
        const previousFile = this.getFile(path)
        if (!previousFile) throw new Error(`Cannot update unknown agent instruction: ${path}`)
        if (previousFile.content === content) return previousFile

        const file = { content, path: previousFile.path }
        const files = this.snapshot.files.map((candidate) => candidate === previousFile ? file : candidate)
        this.snapshot = { ...this.snapshot, files }
        beforeNotify?.(file)
        const detail: AgentInstructionFileChangedDetail = { file, previousFile }
        this.dispatchEvent(new CustomEvent(agentInstructionFileEvent(file.path), { detail }))

        return file
    }

    remove(path: string) {
        const file = this.getFile(path)
        if (!file) return

        const files = this.snapshot.files.filter((candidate) => candidate !== file)
        this.snapshot = { ...this.snapshot, files }
        this.dispatchEvent(new CustomEvent(AGENT_INSTRUCTION_FILES_CHANGED_EVENT, { detail: { file } }))
    }

    private isCurrentLoad(expectedProjectKey: string, loadRevision: number) {
        return this.snapshot.projectKey === expectedProjectKey && this.loadRevision === loadRevision
    }

    private publishLoadResult(projectKeyValue: string, files: AgentInstructionFile[], errors: AgentInstructionLoadError[]) {
        files.sort((left, right) => left.path.localeCompare(right.path))
        this.setSnapshot({ errors, files, projectKey: projectKeyValue })
    }

    private setSnapshot(snapshot: AgentInstructionsSnapshot) {
        if (this.snapshot === snapshot) return

        this.snapshot = snapshot
        this.dispatchEvent(new CustomEvent<AgentInstructionsSnapshot>(AGENT_INSTRUCTION_FILES_CHANGED_EVENT, { detail: snapshot }))
    }
}

export const agentInstructionsService = new AgentInstructionsService()
