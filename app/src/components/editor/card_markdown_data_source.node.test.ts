import { describe, expect, it, vi } from 'vitest'
import type { Card } from '../../data/data_types'
import { OpenFilesService } from '../../services/open_files_service'
import type { ActionService } from '../../services/actions/action_service'
import { dialogService } from '../../services/dialog_service'
import { CardMarkdownDataSource } from './card_markdown_data_source'

function card(content = 'Original', path = 'design/card.md'): Card {
    return {
        agentConversationErrors: [], agentConversations: [], content,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: 'C-1', internalId: 'card-1',
            owner: null, policy: {}, status: 'todo', title: 'Card',
        },
        hasFrontmatter:true,
        isActive: true,
        path,
    }
}

function setup() {
    const Card = card()
    const dataOwner = Object.assign(new EventTarget(), {
        getState: () => ({
            project: { branch: 'main', id: 'project' }, runningAgents: [],
            snapshot: { activeCards: [Card], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        }),
    })
    const actionOwner = Object.assign(new EventTarget(), {
        getActions: () => [],
        draftStore: { getDeletedDraftActions: () => [], getDraft: () => { throw new Error('No actions') } },
    }) as unknown as EventTarget & Pick<ActionService, 'draftStore' | 'getActions'>
    const openFiles = new OpenFilesService()
    openFiles.init({ actionService: actionOwner, dataService: dataOwner })
    const document = openFiles.openDocument(Card)
    if (document.kind !== 'card') throw new Error('Expected card document')
    const cards = {
        toggleCardPolicy: vi.fn(), updateCardBody: vi.fn(), updateCardHeaderFields: vi.fn(),
        updateCardTitle: vi.fn().mockResolvedValue({}), updateCardType: vi.fn(),
    }
    const source = new CardMarkdownDataSource()
    source.init(Object.assign(dataOwner, { cards }))
    source.bindListCards(openFiles)

    return { cards, document, source }
}

describe('CardMarkdownDataSource', () => {
    it('retains the full canonical list document target', () => {
        const { document, source } = setup()

        expect(source.getActiveTarget('list-card')).toEqual({ document })
        expect(source.getMarkdown({ document })).toBe('Original')
    })

    it('updates one shared draft while typing and schedules its captured save revision on commit', () => {
        const { cards, document, source } = setup()
        const target = { document }

        source.edit('list-card', target, 'Edited')
        expect(document.getDraft().content).toBe('Edited')
        expect(document.dirty).toBe(true)

        expect(source.commit('list-card', target, 'Edited')).toBe(true)
        expect(cards.updateCardBody).toHaveBeenCalledWith(document.path, 'Edited', expect.any(Object))
    })

    it('allows the editor cleanup to commit after the popup disposes its bindings', () => {
        const { cards, document, source } = setup()
        const target = { document }

        source.edit('list-card', target, 'Edited before close')
        source.dispose()

        expect(source.commit('list-card', target, 'Edited before close')).toBe(true)
        expect(cards.updateCardBody).toHaveBeenCalledWith(document.path, 'Edited before close', expect.any(Object))
    })

    it('updates card type through the active binding', async () => {
        const { cards, document, source } = setup()
        cards.updateCardType.mockResolvedValue({})

        await source.updateActiveCardType('list-card', 'bug')

        expect(cards.updateCardType).toHaveBeenCalledWith(document.path, 'bug')
    })

    it('routes metadata edits through focused operations without changing body draft state', () => {
        const { cards, document, source } = setup()

        source.updateActiveCardTitle('list-card', 'Renamed')
        source.updateActiveCardHeaderField('list-card', 'author', 'AB')
        source.toggleActiveCardPolicy('list-card', 'review')

        expect(cards.updateCardTitle).toHaveBeenCalledWith(document.path, 'Renamed')
        expect(cards.updateCardHeaderFields).toHaveBeenCalledWith(document.path, { author: 'AB' })
        expect(cards.toggleCardPolicy).toHaveBeenCalledWith(document.path, 'review')
        expect(document.getDraft()).toEqual({ content: 'Original' })
        expect(document.dirty).toBe(false)
    })

    it('reports card type persistence failures', async () => {
        const { cards, source } = setup()
        const error = new Error('Type update rejected')
        const reportError = vi.spyOn(dialogService, 'error')
        cards.updateCardType.mockRejectedValue(error)

        await source.updateActiveCardType('list-card', 'bug')

        expect(reportError).toHaveBeenCalledWith(error, { fallbackMessage: 'Card type update failed: design/card.md' })
    })

})
