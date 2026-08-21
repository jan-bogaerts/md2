import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../data/action_context'
import type { DataService } from './data/data_service'
import { CardPopupService } from './card_popup_service'

class PopupDataService extends EventTarget {
    project: { branch: string, id: string } | null = { branch: 'main', id: 'project-1' }

    getState() {
        return { project: this.project }
    }
}

const services: CardPopupService[] = []

function createService() {
    const owner = new PopupDataService()
    const service = new CardPopupService(owner as unknown as DataService)
    services.push(service)

    return { owner, service }
}

function actionContext(cardInternalId: string): ActionContext {
    return { cardInternalId, file: `design/${cardInternalId}.md`, kind: 'card' }
}

function anchor() {
    return document.createElement('button')
}

afterEach(() => {
    services.forEach((service) => service.clear())
    services.length = 0
})

describe('CardPopupService', () => {
    it('keeps mixed popup kinds in one activation order without replacing entries', () => {
        const { service } = createService()
        service.toggleAction(actionContext('card-1'), anchor())
        service.toggleCardDetails('card-1', anchor())
        service.toggleCardDetails('card-2', anchor())
        const [actionEntry, firstDetailsEntry, secondDetailsEntry] = service.getSnapshot()

        service.activate(actionEntry.id)

        expect(service.getSnapshot()).toEqual([firstDetailsEntry, secondDetailsEntry, actionEntry])
        expect(service.getSnapshot()[2]).toBe(actionEntry)
    })

    it('uses independent toggle identities for action and card-details popups', () => {
        const { service } = createService()
        service.toggleAction(actionContext('card-1'), anchor())
        service.toggleCardDetails('card-1', anchor())
        service.toggleCardDetails('card-2', anchor())

        service.toggleCardDetails('card-1', anchor())

        expect(service.getSnapshot().map(({ kind }) => kind)).toEqual(['action', 'card-details'])
        expect(service.getSnapshot()[1]).toMatchObject({ cardInternalId: 'card-2' })
    })

    it('selects worktree diff and activates an existing card-details entry', () => {
        const { service } = createService()
        service.toggleCardDetails('card-1', anchor())
        const firstEntry = service.getSnapshot()[0]
        service.toggleAction(actionContext('card-2'), anchor())

        service.openWorktreeDiff('card-1', anchor())

        expect(service.getSnapshot()).toHaveLength(2)
        expect(service.getSnapshot().at(-1)).toMatchObject({
            diffSelection: { kind: 'worktree' },
            id: firstEntry.id,
            kind: 'card-details',
        })
    })

    it('closes only matching card details by stable identity', () => {
        const { service } = createService()
        service.toggleAction(actionContext('card-1'), anchor())
        service.toggleCardDetails('card-1', anchor())
        service.toggleCardDetails('card-2', anchor())

        service.closeCardDetailsByInternalId('card-1')

        expect(service.getSnapshot().map(({ kind }) => kind)).toEqual(['action', 'card-details'])
        expect(service.getSnapshot()[1]).toMatchObject({ cardInternalId: 'card-2' })
    })

    it('closes card details on board exit while preserving action popups', () => {
        const { service } = createService()
        service.toggleAction(actionContext('card-1'), anchor())
        service.toggleCardDetails('card-1', anchor())

        service.closeCardDetails()

        expect(service.getSnapshot()).toHaveLength(1)
        expect(service.getSnapshot()[0]).toMatchObject({ kind: 'action' })
    })

    it('clears all popup kinds when project identity changes', () => {
        const { owner, service } = createService()
        const changed = vi.fn()
        service.addEventListener('changed', changed)
        service.toggleAction(actionContext('card-1'), anchor())
        service.toggleCardDetails('card-1', anchor())
        owner.project = { branch: 'feature', id: 'project-1' }

        owner.dispatchEvent(new Event('changed'))

        expect(service.getSnapshot()).toEqual([])
        expect(changed).toHaveBeenCalledTimes(3)
    })
})
