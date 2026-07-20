import { describe, expect, it, vi } from 'vitest'
import type { ProjectCard, ProjectSnapshot } from '../../data/data_types'
import { dialogService } from '../../services/dialog_service'
import { CardMarkdownDataSource } from './card_markdown_data_source'
import type { MarkdownReplacedDetail } from './markdown_data_source'

function card(content: string, path = 'design/F-1.md'): ProjectCard {
    return {
        agentConversationErrors: [], agentConversations: [], content,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: 'F-1', internalId: 'card-1',
            owner: null, policy: {}, status: 'todo', title: 'Card',
        },
        headerFields: {}, isActive: true, path,
    }
}

function owner(initialCard: ProjectCard) {
    let project = { branch: 'main', id: 'project-one' }
    let snapshot: ProjectSnapshot = { activeCards: [initialCard], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' }
    const eventTarget = new EventTarget()
    const updateCardBody = vi.fn((path: string, markdown: string) => {
        const current = snapshot.activeCards[0]
        snapshot = { ...snapshot, activeCards: [{ ...current, content: markdown, path }] }
        eventTarget.dispatchEvent(new CustomEvent('changed'))

        return { content: markdown, path }
    })

    return Object.assign(eventTarget, {
        cards: { updateCardBody },
        getState: () => ({ project, runningAgents: [], snapshot }),
        renew: (nextCard: ProjectCard) => {
            snapshot = { ...snapshot, activeCards: [nextCard] }
            eventTarget.dispatchEvent(new CustomEvent('changed'))
        },
        switchProject: () => {
            project = { branch: 'main', id: 'project-two' }
            eventTarget.dispatchEvent(new CustomEvent('changed'))
        },
        updateCardBody,
    })
}

describe('CardMarkdownDataSource', () => {
    it('commits by internal ID while resolving latest path and marks echo origin', () => {
        const cardOwner = owner(card('Original'))
        const source = new CardMarkdownDataSource()
        source.init(cardOwner)
        const replaced = vi.fn()
        source.addEventListener('markdownReplaced', replaced)
        cardOwner.renew(card('Original', 'design/renamed.md'))

        source.edit('board-card', 'card-1', 'Edited')
        expect(source.commit('board-card', 'card-1', 'Edited')).toBe(true)

        expect(cardOwner.updateCardBody).toHaveBeenCalledWith('design/renamed.md', 'Edited')
        const detail = (replaced.mock.calls[0][0] as CustomEvent<MarkdownReplacedDetail>).detail
        expect(detail).toEqual({ documentId: 'card-1', originBinding: 'board-card' })
    })

    it('ignores header-only renewal and reports external content replacement', () => {
        const cardOwner = owner(card('Original'))
        const source = new CardMarkdownDataSource()
        source.init(cardOwner)
        const replaced = vi.fn()
        source.addEventListener('markdownReplaced', replaced)

        cardOwner.renew({ ...card('Original'), header: { ...card('Original').header, title: 'Renamed' } })
        cardOwner.renew(card('External'))

        expect(replaced).toHaveBeenCalledOnce()
        expect((replaced.mock.calls[0][0] as CustomEvent<MarkdownReplacedDetail>).detail.originBinding).toBeNull()
    })

    it('reports synchronous failure and keeps commit rejected', () => {
        const cardOwner = owner(card('Original'))
        cardOwner.updateCardBody.mockImplementation(() => { throw new Error('write failed') })
        const source = new CardMarkdownDataSource()
        source.init(cardOwner)
        const reportError = vi.spyOn(dialogService, 'error')

        expect(source.commit('list-card', 'card-1', 'Edited')).toBe(false)
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Body update failed: design/F-1.md' })
    })

    it('clears every card binding on project switch', () => {
        const cardOwner = owner(card('Original'))
        const source = new CardMarkdownDataSource()
        source.init(cardOwner)
        source.setActiveDocument('board-card', 'card-1')
        source.setActiveDocument('list-card', 'card-1')

        cardOwner.switchProject()

        expect(source.getBindingsSnapshot()).toEqual({
            activeBoardCardDocumentId: null,
            activeListActionDocumentId: null,
            activeListCardDocumentId: null,
        })
    })
})
