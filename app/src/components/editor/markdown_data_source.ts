import type { ActionOpenDocument, CardOpenDocument, OpenDocument } from '../../services/open_files_service'

export type MarkdownBindingKind = 'board-card' | 'list-action' | 'list-card'

export type ActionMarkdownSection =
    | { kind: 'prompt' }
    | { kind: 'phrase', identity: string }

export type MarkdownDocumentTarget =
    | { document: ActionOpenDocument, section: ActionMarkdownSection }
    | { document: CardOpenDocument, section?: never }

export interface ActiveMarkdownDocumentChangedDetail {
    binding: MarkdownBindingKind
    /** Drop outgoing buffer because owning domain data was explicitly discarded. */
    discard?: boolean
    target: MarkdownDocumentTarget | null
}

export interface MarkdownReplacedDetail {
    originBinding: MarkdownBindingKind | null
    target: MarkdownDocumentTarget
}

export interface MarkdownBindingsSnapshot {
    activeBoardCardTarget: MarkdownDocumentTarget | null
    activeListActionTarget: MarkdownDocumentTarget | null
    activeListCardTarget: MarkdownDocumentTarget | null
}

export interface MarkdownDataSource extends EventTarget {
    commit(binding: MarkdownBindingKind, target: MarkdownDocumentTarget, markdown: string): boolean
    edit(binding: MarkdownBindingKind, target: MarkdownDocumentTarget, markdown: string): void
    getActiveTarget(binding: MarkdownBindingKind): MarkdownDocumentTarget | null
    getMarkdown(target: MarkdownDocumentTarget): string
}

const INITIAL_BINDINGS: MarkdownBindingsSnapshot = {
    activeBoardCardTarget: null,
    activeListActionTarget: null,
    activeListCardTarget: null,
}

function bindingSnapshotKey(binding: MarkdownBindingKind): keyof MarkdownBindingsSnapshot {
    if (binding === 'board-card') return 'activeBoardCardTarget'
    if (binding === 'list-card') return 'activeListCardTarget'

    return 'activeListActionTarget'
}

export function sameMarkdownTarget(first: MarkdownDocumentTarget | null, second: MarkdownDocumentTarget | null) {
    if (first?.document !== second?.document) return false
    if (!first || !second) return true
    if (!first.section && !second.section) return true
    if (!first.section || !second.section) return false
    if (first.section.kind !== second.section.kind) return false

    return first.section.kind === 'prompt'
        || (second.section.kind === 'phrase' && first.section.identity === second.section.identity)
}

export function markdownTargetDocument(target: MarkdownDocumentTarget): OpenDocument {
    return target.document
}

/** Shared active-target and event behavior for Markdown sources. */
export abstract class MarkdownDataSourceBase extends EventTarget implements MarkdownDataSource {
    private bindings = INITIAL_BINDINGS

    abstract commit(binding: MarkdownBindingKind, target: MarkdownDocumentTarget, markdown: string): boolean
    abstract edit(binding: MarkdownBindingKind, target: MarkdownDocumentTarget, markdown: string): void
    abstract getMarkdown(target: MarkdownDocumentTarget): string

    getBindingsSnapshot() {
        return this.bindings
    }

    getActiveTarget(binding: MarkdownBindingKind) {
        return this.bindings[bindingSnapshotKey(binding)]
    }

    setActiveTarget(binding: MarkdownBindingKind, target: MarkdownDocumentTarget | null, discard = false) {
        const key = bindingSnapshotKey(binding)
        if (sameMarkdownTarget(this.bindings[key], target)) return

        this.bindings = { ...this.bindings, [key]: target }
        const detail: ActiveMarkdownDocumentChangedDetail = { binding, discard, target }
        this.dispatchEvent(new CustomEvent('activeDocumentChanged', { detail }))
    }

    clearBindings(discard = false) {
        for (const binding of ['board-card', 'list-card', 'list-action'] as const) this.setActiveTarget(binding, null, discard)
    }

    protected dispatchMarkdownReplaced(detail: MarkdownReplacedDetail) {
        this.dispatchEvent(new CustomEvent('markdownReplaced', { detail }))
    }
}
