import { describe, expect, it, vi } from 'vitest'
import type { ActionDefinition, RawActionDefinition } from '../../data/action_types'
import type { ActionOpenDocument } from '../../services/open_files_service'
import { ActionMarkdownDataSource } from './action_markdown_data_source'
import type { MarkdownDocumentTarget } from './markdown_data_source'

function setup() {
    let draft: RawActionDefinition = {
        description: 'Review', id: 'review', label: 'Review',
        phrases: [{ text: 'Run tests', title: 'Tests' }], prompt: 'Review it', type: 'agent',
    }
    const action = {
        ...draft,
        agent: null, appliesTo: null, permissionMode: draft.permissionMode ?? null,
        builtin: false, command: null, icon: null, model: null,
        needsWorkTree: false, on: [], onAfter: [], onBefore: [], onState: null,
        output: draft.output ?? null,
        phrases: draft.phrases ?? [], prompt: draft.prompt ?? null,
        showCommandWindow: false, sourcePath: 'actions/review.json', thinkingLevel: null,
        trackFileChanges: false, streaming: draft.streaming ?? false,
        type: 'agent',
        editorState: {
            phrases: [{ identity: 'phrase-1', phrase: draft.phrases?.[0] as NonNullable<typeof draft.phrases>[number] }],
            selectedTab: 'prompt',
        },
    } satisfies ActionDefinition
    const document = Object.assign(new EventTarget(), {
        createSaveReference: vi.fn(),
        getDraft: () => draft,
        getObject: () => action,
        kind: 'action' as const,
        replaceDraft: (definition: RawActionDefinition) => { draft = definition },
        updateDraft: (definition: RawActionDefinition) => { draft = definition },
    }) as unknown as ActionOpenDocument
    Object.defineProperties(document, {
        dirty: { get: () => true },
        path: { get: () => 'actions/review.json' },
    })
    const service = Object.assign(new EventTarget(), {
        draftStore: {
            commitDraft: vi.fn(),
            getDraft: vi.fn(() => ({
                conflict: null, definition: draft, deleted: false, error: null, revision: 1, savedRevision: 0,
                saving: false,
                validation: { code: null, error: null, field: null, fieldPath: null, index: null, valid: true },
            })),
            stageDraft: vi.fn((_path: string, definition: RawActionDefinition) => { draft = definition }),
        },
        setActionEditorState: vi.fn(),
    })
    const source = new ActionMarkdownDataSource()
    source.init(service as unknown as Parameters<ActionMarkdownDataSource['init']>[0])

    return { document, service, source }
}

describe('ActionMarkdownDataSource', () => {
    it('routes prompt and phrase sections through one action document', () => {
        const { document, service, source } = setup()
        const promptTarget: MarkdownDocumentTarget = { document, section: { kind: 'prompt' } }
        const phraseTarget: MarkdownDocumentTarget = {document, section: { identity: 'phrase-1', kind: 'phrase' }}

        source.edit('list-action', promptTarget, 'New prompt')
        source.commit('list-action', phraseTarget, 'New phrase')

        expect(document.getDraft().prompt).toBe('New prompt')
        expect(document.getDraft().phrases?.[0].text).toBe('New phrase')
        expect(service.draftStore.commitDraft).toHaveBeenCalledWith(document.getObject().id)
    })

    it('keeps section identity in active target without public compound IDs', () => {
        const { document, source } = setup()
        const target: MarkdownDocumentTarget = {document, section: { identity: 'phrase-1', kind: 'phrase' }}

        source.setActiveActionTarget(target)

        expect(source.getActiveTarget('list-action')).toBe(target)
        expect(source.getMarkdown(target)).toBe('Run tests')
    })
})
