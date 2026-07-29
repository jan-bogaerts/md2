import type {
    ActionDefinition,
    ActionEditorState,
    RawActionDefinition,
} from '../../data/action_types'
import type { ActionDraftState, ActionService } from './action_service'
import {
    actionDefinitionsEqual,
    editableActionDefinition,
    normalizedPathKey,
    suffixedActionPath,
    validateDraftDefinition,
} from './action_service_helpers'
import { actionFilePath } from './action_definition_writer'
import { openFilesService, type ActionOpenDocument } from '../open_files_service'

interface ManagedActionDraft extends ActionDraftState {
    action: ActionDefinition
    chain: Promise<void>
    committedRevision: number
    deletionRevision: number
    recreating: boolean
    targetPath: string
}

/** Owns the in-progress edit / autosave state machine for action definitions being edited. */
export class ActionDraftStore {
    private readonly drafts = new Map<string, ManagedActionDraft>()
    private readonly host: ActionService

    constructor(host: ActionService) {
        this.host = host
    }

    clear() {
        this.drafts.clear()
    }

    paths(): string[] {
        return [...this.drafts.keys()]
    }

    getDraft(path: string): ActionDraftState {
        const existingDraft = this.drafts.get(path)
        if (existingDraft) return existingDraft

        const action = this.host.getActionByPath(path)
        if (!action) throw new Error(`Cannot create draft for unknown action: ${path}`)
        const definition = editableActionDefinition(action)
        const draft: ManagedActionDraft = {
            action,
            chain: Promise.resolve(),
            committedRevision: 0,
            conflict: null,
            definition,
            deleted: false,
            deletionRevision: 0,
            error: null,
            recreating: false,
            revision: 0,
            savedRevision: 0,
            saving: false,
            targetPath: path,
            validation: validateDraftDefinition(path, definition),
        }
        this.drafts.set(path, draft)

        return draft
    }

    isDeletedAndNotRecreating(path: string): boolean {
        const draft = this.drafts.get(path)

        return !!draft?.deleted && !draft.recreating
    }

    updateDraft(path: string, definition: RawActionDefinition) {
        const current = this.requireDraft(path)
        const revision = current.revision + 1
        const validation = validateDraftDefinition(path, definition)
        const targetPath = validation.valid ? this.desiredActionPath(path, definition.label) : current.targetPath
        const draft = {
            ...current,
            conflict: null,
            committedRevision: revision,
            definition,
            error: null,
            revision,
            targetPath,
            validation,
        }
        this.drafts.set(path, draft)
        this.updateOpenDocument(path, definition)
        this.host.dispatchDraftChanged(path)
        this.host.dispatchPersistenceChanged()
        if (draft.validation.valid && !draft.deleted) this.queueDraftSave(path, definition, revision, targetPath)

        return draft
    }

    /** Store an editor value and mark the draft dirty without validation, events, or persistence. */
    stageDraft(path: string, definition: RawActionDefinition) {
        const current = this.requireDraft(path)
        const draft = {
            ...current,
            conflict: null,
            definition,
            error: null,
            revision: current.revision + 1,
        }
        this.drafts.set(path, draft)
        this.updateOpenDocument(path, definition)

        return draft
    }

    /** Validate and queue the latest staged value at an editor commit boundary. */
    commitDraft(path: string) {
        const current = this.requireDraft(path)
        if (current.committedRevision === current.revision) return current

        const validation = validateDraftDefinition(path, current.definition)
        const targetPath = validation.valid ? this.desiredActionPath(path, current.definition.label) : current.targetPath
        const draft = { ...current, committedRevision: current.revision, targetPath, validation }
        this.drafts.set(path, draft)
        this.host.dispatchDraftChanged(path)
        this.host.dispatchPersistenceChanged()
        if (draft.validation.valid && !draft.conflict && !draft.deleted) {
            this.queueDraftSave(path, draft.definition, draft.revision, targetPath)
        }

        return draft
    }

    retryDraft(path: string) {
        const draft = this.requireDraft(path)
        if (draft.deleted) throw new Error(`Cannot retry a deleted action draft: ${path}`)
        if (!draft.validation.valid) throw new Error(`Cannot retry invalid action draft: ${path}`)
        this.queueDraftSave(path, draft.definition, draft.revision, draft.targetPath)
    }

    keepDraft(path: string) {
        this.commitDraft(path)
        const draft = this.requireDraft(path)
        this.drafts.set(path, { ...draft, conflict: null })
        this.host.dispatchDraftChanged(path)
        this.host.dispatchPersistenceChanged()
        if (draft.validation.valid && draft.revision !== draft.savedRevision) {
            this.queueDraftSave(path, draft.definition, draft.revision, draft.targetPath)
        }
    }

    reloadDraft(path: string) {
        const draft = this.requireDraft(path)
        if (!draft.conflict) return
        const revision = draft.revision + 1
        this.drafts.set(path, {
            ...draft,
            committedRevision: revision,
            conflict: null,
            definition: draft.conflict,
            error: null,
            revision,
            savedRevision: revision,
            targetPath: path,
            validation: validateDraftDefinition(path, draft.conflict),
        })
        this.findOpenDocument(path)?.replaceDraft(draft.conflict)
        this.host.dispatchDraftChanged(path)
        this.host.dispatchPersistenceChanged()
    }

    recreateDeletedDraft(path: string) {
        const draft = this.requireDraft(path)
        if (!draft.deleted) throw new Error(`Cannot recreate an action that is not deleted: ${path}`)
        if (!draft.validation.valid) throw new Error(`Cannot recreate invalid action draft: ${path}`)

        this.queueDraftSave(path, draft.definition, draft.revision, draft.targetPath, true)
    }

    discardDeletedDraft(path: string) {
        const draft = this.requireDraft(path)
        if (!draft.deleted) throw new Error(`Cannot discard an action that is not deleted: ${path}`)

        const document = this.findOpenDocument(path)
        this.host.persistenceGateway().discardPendingFile?.(path)
        this.drafts.delete(path)
        if (document) openFilesService.discardDocument(document)
        this.host.dispatchDraftChanged(path)
        this.host.dispatchPersistenceChanged()
    }

    getDeletedDraftActions() {
        return [...this.drafts.values()]
            .filter(({ deleted }) => deleted)
            .map(({ action }) => action)
    }

    hasPendingDrafts() {
        return [...this.drafts.values()].some((draft) => (
            draft.deleted || draft.revision !== draft.savedRevision || draft.saving || !!draft.error || !!draft.conflict
        ))
    }

    async flushDrafts() {
        for (const path of this.drafts.keys()) this.commitDraft(path)
        const deletedDraft = [...this.drafts.entries()].find(([, draft]) => draft.deleted)
        if (deletedDraft) throw new Error(`Action ${deletedDraft[0]} was deleted and requires explicit recovery or discard`)
        const invalidDraft = [...this.drafts.entries()].find(([, draft]) => (
            draft.revision !== draft.savedRevision && !draft.validation.valid
        ))
        if (invalidDraft) throw new Error(`Action ${invalidDraft[0]} has invalid unsaved changes`)

        await Promise.all([...this.drafts.values()].map(({ chain }) => chain))
        const failedDraft = [...this.drafts.entries()].find(([, draft]) => !!draft.error)
        if (failedDraft) throw new Error(failedDraft[1].error as string)
    }

    reconcileDrafts(previousDefinitions: Map<string, RawActionDefinition>) {
        for (const [path, draft] of this.drafts) {
            const previousDefinition = previousDefinitions.get(path)
            const externalDefinition = this.host.getDefinitionByPath(path)
            if (!externalDefinition) {
                if (!previousDefinition && !draft.recreating) continue

                const gateway = this.host.persistenceGateway()
                const pendingPersistence = gateway.hasPendingFile?.(path) ?? false
                gateway.discardPendingFile?.(path)
                const recoverable = draft.revision !== draft.savedRevision
                    || draft.saving
                    || draft.recreating
                    || pendingPersistence
                    || !!draft.error
                    || !!draft.conflict
                if (!recoverable) {
                    this.drafts.delete(path)
                    continue
                }
                this.drafts.set(path, {
                    ...draft,
                    conflict: null,
                    deleted: true,
                    deletionRevision: draft.deletionRevision + 1,
                    recreating: false,
                    saving: false,
                })
                continue
            }
            const externalAction = this.host.getActionByPath(path)
            if (!externalAction) throw new Error(`Missing external action after reload: ${path}`)
            if (draft.deleted) {
                this.drafts.set(path, { ...draft, action: externalAction, conflict: externalDefinition, deleted: false })
                continue
            }
            if (!previousDefinition || actionDefinitionsEqual(previousDefinition, externalDefinition)) continue

            if (draft.revision !== draft.savedRevision) {
                this.drafts.set(path, { ...draft, action: externalAction, conflict: externalDefinition })
                continue
            }
            const revision = draft.revision + 1
            this.drafts.set(path, {
                ...draft,
                action: externalAction,
                committedRevision: revision,
                conflict: null,
                definition: externalDefinition,
                error: null,
                revision,
                savedRevision: revision,
                targetPath: path,
                validation: validateDraftDefinition(path, externalDefinition),
            })
        }
    }

    /** Read-only lookup of the draft (if any) affected by a committed rename, before core state is rebuilt. */
    peekRenameInfo(fromPath: string, toPath: string): {
        committedDraftDefinition: RawActionDefinition | undefined
        editorState: ActionEditorState | undefined
        hasDraft: boolean
    } {
        const draft = this.selectDraftForRename(fromPath, toPath)
        const committedDraftDefinition = draft && draft.committedRevision === draft.revision && draft.validation.valid
            ? draft.definition
            : undefined

        return { committedDraftDefinition, editorState: draft?.action.editorState, hasDraft: !!draft }
    }

    /** Apply a committed rename to the draft map once the renamed action is known. Must follow peekRenameInfo. */
    finalizeRenamedDraft(fromPath: string, toPath: string, committedAction: ActionDefinition) {
        const draft = this.selectDraftForRename(fromPath, toPath)
        this.drafts.delete(fromPath)
        this.drafts.delete(toPath)
        if (!draft) return

        this.drafts.set(toPath, {
            ...draft,
            action: committedAction,
            conflict: null,
            deleted: false,
            targetPath: draft.targetPath === fromPath ? toPath : draft.targetPath,
        })
        this.host.dispatchDraftChanged(toPath)
    }

    private selectDraftForRename(fromPath: string, toPath: string): ManagedActionDraft | undefined {
        const sourceDraft = this.drafts.get(fromPath)
        const targetDraft = this.drafts.get(toPath)

        return sourceDraft && targetDraft
            ? sourceDraft.revision >= targetDraft.revision ? sourceDraft : targetDraft
            : sourceDraft ?? targetDraft
    }

    private desiredActionPath(sourcePath: string, label: string) {
        const normalizedSourcePath = sourcePath.replace(/\\/gu, '/')
        const separatorIndex = normalizedSourcePath.lastIndexOf('/')
        if (separatorIndex < 0) throw new Error(`Action path must include its actions folder: ${sourcePath}`)

        const actionsFolder = normalizedSourcePath.slice(0, separatorIndex)
        const desiredPath = actionFilePath(actionsFolder, label)
        const sourcePathKey = normalizedPathKey(normalizedSourcePath)
        const occupiedPaths = new Set(
            this.host.getFiles()
                .map(({ path }) => normalizedPathKey(path))
                .filter((path) => path !== sourcePathKey),
        )
        for (const [draftPath, draft] of this.drafts) {
            if (draftPath === sourcePath) continue
            occupiedPaths.add(normalizedPathKey(draft.targetPath))
        }
        if (!occupiedPaths.has(desiredPath.toLowerCase())) return desiredPath

        let suffix = 2
        while (occupiedPaths.has(suffixedActionPath(desiredPath, suffix).toLowerCase())) suffix += 1

        return suffixedActionPath(desiredPath, suffix)
    }

    private requireDraft(path: string) {
        this.getDraft(path)
        const draft = this.drafts.get(path)
        if (!draft) throw new Error(`Missing action draft: ${path}`)

        return draft
    }

    private queueDraftSave(
        path: string,
        definition: RawActionDefinition,
        revision: number,
        targetPath: string,
        recreate = false,
    ) {
        const current = this.requireDraft(path)
        const deletionRevision = current.deletionRevision
        const saveReference = this.findOpenDocument(path)?.createSaveReference()
        const chain = current.chain.then(async () => {
            const startedDraft = this.drafts.get(path)
            if (!startedDraft) return
            if (startedDraft.deletionRevision !== deletionRevision || (startedDraft.deleted && !recreate)) return
            this.drafts.set(path, { ...startedDraft, error: null, recreating: recreate, saving: true })
            this.host.dispatchDraftChanged(path)
            this.host.dispatchPersistenceChanged()
            try {
                await this.host.saveDefinition(
                    path,
                    definition,
                    targetPath,
                    saveReference,
                    () => this.acknowledgeDraftPersistence(path, revision, deletionRevision),
                )
                const savedDraft = this.drafts.get(path)
                if (!savedDraft) return
                if (savedDraft.deletionRevision !== deletionRevision) return
                this.drafts.set(path, {
                    ...savedDraft,
                    deleted: recreate ? false : savedDraft.deleted,
                    error: null,
                    recreating: false,
                    saving: false,
                })
            } catch (error) {
                const failedDraft = this.drafts.get(path)
                if (!failedDraft) return
                if (failedDraft.deletionRevision !== deletionRevision) return
                const message = error instanceof Error ? error.message : 'Action save failed'
                this.drafts.set(path, { ...failedDraft, error: message, recreating: false, saving: false })
            }
            this.host.dispatchDraftChanged(path)
            this.host.dispatchPersistenceChanged()
        })
        this.drafts.set(path, { ...current, chain })
    }

    private acknowledgeDraftPersistence(path: string, revision: number, deletionRevision: number) {
        const draft = this.drafts.get(path)
        if (!draft || draft.deletionRevision !== deletionRevision) return

        this.drafts.set(path, { ...draft, savedRevision: Math.max(draft.savedRevision, revision) })
        this.host.dispatchDraftChanged(path)
        this.host.dispatchPersistenceChanged()
    }

    private findOpenDocument(path: string): ActionOpenDocument | null {
        const action = this.drafts.get(path)?.action ?? this.host.getActionByPath(path)
        if (!action) return null

        const document = openFilesService.findDocument(action)
        return document?.kind === 'action' ? document : null
    }

    private updateOpenDocument(path: string, definition: RawActionDefinition) {
        this.findOpenDocument(path)?.updateDraft(definition, this.host)
    }
}
