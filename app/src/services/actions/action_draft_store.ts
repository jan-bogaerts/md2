import type {
    ActionDefinition,
    ActionEditorState,
    RawActionDefinition,
    RawActionDefinitionEntry,
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

const FIRST_ACTION_PATH_SUFFIX = 2

interface ManagedActionDraft extends ActionDraftState {
    action: ActionDefinition
    chain: Promise<void>
    committedRevision: number
    deletionRevision: number
    recreating: boolean
}

/** Owns in-progress action definitions by stable action ID; paths remain persistence metadata. */
export class ActionDraftStore {
    private readonly drafts = new Map<string, ManagedActionDraft>()
    private readonly host: ActionService

    constructor(host: ActionService) {
        this.host = host
    }

    clear() {
        this.drafts.clear()
    }

    actionIds(): string[] {
        return [...this.drafts.keys()]
    }

    getDraft(actionId: string): ActionDraftState {
        const existingDraft = this.drafts.get(actionId)
        if (existingDraft) return existingDraft

        const action = this.host.getActionById(actionId)
        if (!action?.sourcePath) throw new Error(`Cannot create draft for unknown action: ${actionId}`)
        const definition = editableActionDefinition(action)
        const sourcePath = action.sourcePath
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
            sourcePath,
            targetPath: sourcePath,
            validation: validateDraftDefinition(sourcePath, definition),
        }
        this.drafts.set(actionId, draft)

        return draft
    }

    isDeletedAndNotRecreating(actionId: string): boolean {
        const draft = this.drafts.get(actionId)

        return !!draft?.deleted && !draft.recreating
    }

    updateDraft(actionId: string, definition: RawActionDefinition) {
        const current = this.requireDraft(actionId)
        const revision = current.revision + 1
        const validation = validateDraftDefinition(current.sourcePath, definition)
        const targetPath = validation.valid ? this.desiredActionPath(actionId, current.sourcePath, definition.label) : current.targetPath
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
        this.drafts.set(actionId, draft)
        this.updateOpenDocument(actionId, definition)
        this.host.dispatchDraftChanged(actionId)
        this.host.dispatchPersistenceChanged()
        if (draft.validation.valid && !draft.deleted) this.queueDraftSave(actionId, definition, revision, targetPath)

        return draft
    }

    /** Store an editor value and mark draft dirty without validation, events, or persistence. */
    stageDraft(actionId: string, definition: RawActionDefinition) {
        const current = this.requireDraft(actionId)
        const draft = {
            ...current,
            conflict: null,
            definition,
            error: null,
            revision: current.revision + 1,
        }
        this.drafts.set(actionId, draft)
        this.updateOpenDocument(actionId, definition)

        return draft
    }

    /** Validate and queue latest staged value at editor commit boundary. */
    commitDraft(actionId: string) {
        const current = this.requireDraft(actionId)
        if (current.committedRevision === current.revision) return current

        const validation = validateDraftDefinition(current.sourcePath, current.definition)
        const targetPath = validation.valid
            ? this.desiredActionPath(actionId, current.sourcePath, current.definition.label)
            : current.targetPath
        const draft = { ...current, committedRevision: current.revision, targetPath, validation }
        this.drafts.set(actionId, draft)
        this.host.dispatchDraftChanged(actionId)
        this.host.dispatchPersistenceChanged()
        if (draft.validation.valid && !draft.conflict && !draft.deleted) {
            this.queueDraftSave(actionId, draft.definition, draft.revision, targetPath)
        }

        return draft
    }

    retryDraft(actionId: string) {
        const draft = this.requireDraft(actionId)
        if (draft.deleted) throw new Error(`Cannot retry deleted action draft: ${actionId}`)
        if (!draft.validation.valid) throw new Error(`Cannot retry invalid action draft: ${actionId}`)
        this.queueDraftSave(actionId, draft.definition, draft.revision, draft.targetPath)
    }

    keepDraft(actionId: string) {
        this.commitDraft(actionId)
        const draft = this.requireDraft(actionId)
        this.drafts.set(actionId, { ...draft, conflict: null })
        this.host.dispatchDraftChanged(actionId)
        this.host.dispatchPersistenceChanged()
        if (draft.validation.valid && draft.revision !== draft.savedRevision) {
            this.queueDraftSave(actionId, draft.definition, draft.revision, draft.targetPath)
        }
    }

    reloadDraft(actionId: string) {
        const draft = this.requireDraft(actionId)
        if (!draft.conflict) return
        const revision = draft.revision + 1
        this.drafts.set(actionId, {
            ...draft,
            committedRevision: revision,
            conflict: null,
            definition: draft.conflict,
            error: null,
            revision,
            savedRevision: revision,
            targetPath: draft.sourcePath,
            validation: validateDraftDefinition(draft.sourcePath, draft.conflict),
        })
        this.findOpenDocument(actionId)?.replaceDraft(draft.conflict)
        this.host.dispatchDraftChanged(actionId)
        this.host.dispatchPersistenceChanged()
    }

    recreateDeletedDraft(actionId: string) {
        const draft = this.requireDraft(actionId)
        if (!draft.deleted) throw new Error(`Cannot recreate action draft that is not deleted: ${actionId}`)
        if (!draft.validation.valid) throw new Error(`Cannot recreate invalid action draft: ${actionId}`)

        this.queueDraftSave(actionId, draft.definition, draft.revision, draft.targetPath, true)
    }

    discardDeletedDraft(actionId: string) {
        const draft = this.requireDraft(actionId)
        if (!draft.deleted) throw new Error(`Cannot discard action draft that is not deleted: ${actionId}`)

        const document = this.findOpenDocument(actionId)
        this.host.persistenceGateway().discardPendingFile?.(draft.sourcePath)
        this.drafts.delete(actionId)
        if (document) openFilesService.discardDocument(document)
        this.host.dispatchDraftChanged(actionId)
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
        for (const actionId of this.drafts.keys()) this.commitDraft(actionId)
        const deletedDraft = [...this.drafts.entries()].find(([, draft]) => draft.deleted)
        if (deletedDraft) throw new Error(`Action ${deletedDraft[0]} was deleted and requires explicit recovery or discard`)
        const invalidDraft = [...this.drafts.entries()].find(([, draft]) => (
            draft.revision !== draft.savedRevision && !draft.validation.valid
        ))
        if (invalidDraft) throw new Error(`Action ${invalidDraft[0]} has invalid unsaved changes`)

        await Promise.all([...this.drafts.values()].map(({ chain }) => chain))
        const failedDraft = [...this.drafts.values()].find(({ error }) => !!error)
        if (failedDraft) throw new Error(failedDraft.error as string)
    }

    reconcileDrafts(previousDefinitions: Map<string, RawActionDefinitionEntry>) {
        for (const [actionId, draft] of this.drafts) {
            const previousEntry = previousDefinitions.get(actionId)
            const externalEntry = this.host.getDefinitionEntryById(actionId)
            if (!externalEntry) {
                if (!previousEntry && !draft.recreating) continue

                const gateway = this.host.persistenceGateway()
                const pendingPersistence = (gateway.hasPendingFile?.(draft.sourcePath) ?? false)
                    || (gateway.hasPendingFile?.(draft.targetPath) ?? false)
                gateway.discardPendingFile?.(draft.sourcePath)
                const recoverable = draft.revision !== draft.savedRevision
                    || draft.saving
                    || draft.recreating
                    || pendingPersistence
                    || !!draft.error
                    || !!draft.conflict
                if (!recoverable) {
                    this.drafts.delete(actionId)
                    continue
                }
                this.drafts.set(actionId, {
                    ...draft,
                    conflict: null,
                    deleted: true,
                    deletionRevision: draft.deletionRevision + 1,
                    recreating: false,
                    saving: false,
                })
                continue
            }
            const externalAction = this.host.getActionById(actionId)
            if (!externalAction) throw new Error(`Missing external action after reload: ${actionId}`)
            if (draft.deleted) {
                this.drafts.set(actionId, { ...draft, action: externalAction, conflict: externalEntry.definition, deleted: false })
                continue
            }
            if (previousEntry && actionDefinitionsEqual(previousEntry.definition, externalEntry.definition)) {
                const targetPath = draft.targetPath === draft.sourcePath ? externalEntry.path : draft.targetPath
                this.drafts.set(actionId, { ...draft, action: externalAction, sourcePath: externalEntry.path, targetPath })
                continue
            }
            if (!previousEntry) continue

            if (draft.revision !== draft.savedRevision) {
                this.drafts.set(actionId, { ...draft, action: externalAction, conflict: externalEntry.definition })
                continue
            }
            const revision = draft.revision + 1
            this.drafts.set(actionId, {
                ...draft,
                action: externalAction,
                committedRevision: revision,
                conflict: null,
                definition: externalEntry.definition,
                error: null,
                revision,
                savedRevision: revision,
                sourcePath: externalEntry.path,
                targetPath: externalEntry.path,
                validation: validateDraftDefinition(externalEntry.path, externalEntry.definition),
            })
        }
    }

    /** Read draft state affected by committed rename before core state rebuild. */
    peekRenameInfo(actionId: string): {
        committedDraftDefinition: RawActionDefinition | undefined
        editorState: ActionEditorState | undefined
        hasDraft: boolean
    } {
        const draft = this.drafts.get(actionId)
        const committedDraftDefinition = draft
            && draft.committedRevision === draft.revision
            && draft.validation.valid
            ? draft.definition
            : undefined

        return { committedDraftDefinition, editorState: draft?.action.editorState, hasDraft: !!draft }
    }

    /** Apply committed rename to same ID-owned draft once renamed action is known. */
    finalizeRenamedDraft(actionId: string, toPath: string, committedAction: ActionDefinition) {
        const draft = this.drafts.get(actionId)
        if (!draft) return

        const targetPath = draft.targetPath === draft.sourcePath ? toPath : draft.targetPath
        this.drafts.set(actionId, {
            ...draft,
            action: committedAction,
            conflict: null,
            deleted: false,
            sourcePath: toPath,
            targetPath,
        })
        this.host.dispatchDraftChanged(actionId)
    }

    private desiredActionPath(actionId: string, sourcePath: string, label: string) {
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
        for (const [draftActionId, draft] of this.drafts) {
            if (draftActionId === actionId) continue
            occupiedPaths.add(normalizedPathKey(draft.targetPath))
        }
        if (!occupiedPaths.has(desiredPath.toLowerCase())) return desiredPath

        const maximumSuffix = occupiedPaths.size + FIRST_ACTION_PATH_SUFFIX
        for (let suffix = FIRST_ACTION_PATH_SUFFIX; suffix <= maximumSuffix; suffix += 1) {
            const candidatePath = suffixedActionPath(desiredPath, suffix)
            if (!occupiedPaths.has(normalizedPathKey(candidatePath))) return candidatePath
        }

        throw new Error(`Cannot find an available path for action ${actionId}`)
    }

    private requireDraft(actionId: string) {
        this.getDraft(actionId)
        const draft = this.drafts.get(actionId)
        if (!draft) throw new Error(`Missing action draft: ${actionId}`)

        return draft
    }

    private queueDraftSave(
        actionId: string,
        definition: RawActionDefinition,
        revision: number,
        targetPath: string,
        recreate = false,
    ) {
        const current = this.requireDraft(actionId)
        const deletionRevision = current.deletionRevision
        const sourcePath = current.sourcePath
        const saveReference = this.findOpenDocument(actionId)?.createSaveReference()
        const chain = current.chain.then(async () => {
            const startedDraft = this.drafts.get(actionId)
            if (!startedDraft) return
            if (startedDraft.deletionRevision !== deletionRevision || (startedDraft.deleted && !recreate)) return
            this.drafts.set(actionId, { ...startedDraft, error: null, recreating: recreate, saving: true })
            this.host.dispatchDraftChanged(actionId)
            this.host.dispatchPersistenceChanged()
            try {
                await this.host.saveDefinition(
                    sourcePath,
                    definition,
                    targetPath,
                    saveReference,
                    () => this.acknowledgeDraftPersistence(actionId, revision, deletionRevision),
                )
                const savedDraft = this.drafts.get(actionId)
                if (!savedDraft || savedDraft.deletionRevision !== deletionRevision) return
                this.drafts.set(actionId, {
                    ...savedDraft,
                    deleted: recreate ? false : savedDraft.deleted,
                    error: null,
                    recreating: false,
                    saving: false,
                })
            } catch (error) {
                const failedDraft = this.drafts.get(actionId)
                if (!failedDraft || failedDraft.deletionRevision !== deletionRevision) return
                const message = error instanceof Error ? error.message : 'Action save failed'
                this.drafts.set(actionId, { ...failedDraft, error: message, recreating: false, saving: false })
            }
            this.host.dispatchDraftChanged(actionId)
            this.host.dispatchPersistenceChanged()
        })
        this.drafts.set(actionId, { ...current, chain })
    }

    private acknowledgeDraftPersistence(actionId: string, revision: number, deletionRevision: number) {
        const draft = this.drafts.get(actionId)
        if (!draft || draft.deletionRevision !== deletionRevision) return

        this.drafts.set(actionId, { ...draft, savedRevision: Math.max(draft.savedRevision, revision) })
        this.host.dispatchDraftChanged(actionId)
        this.host.dispatchPersistenceChanged()
    }

    private findOpenDocument(actionId: string): ActionOpenDocument | null {
        const action = this.drafts.get(actionId)?.action ?? this.host.getActionById(actionId)
        if (!action) return null

        const document = openFilesService.findDocument(action)
        return document?.kind === 'action' ? document : null
    }

    private updateOpenDocument(actionId: string, definition: RawActionDefinition) {
        this.findOpenDocument(actionId)?.updateDraft(definition, this.host)
    }
}
