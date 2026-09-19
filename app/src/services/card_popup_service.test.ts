import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../data/action_context'
import type { DataService } from './data/data_service'
import { CardPopupService } from './card_popup_service'
import { MobileBackDismissService } from './mobile_back_dismiss_service'

class PopupDataService extends EventTarget {
    project: { branch: string, id: string } | null = { branch: 'main', id: 'project-1' }

    getState() {
        return { project: this.project }
    }
}

const services: CardPopupService[] = []
const originalWindow = window
let testWindow: ReturnType<typeof installTestWindow>

interface TestHistory {
    go: ReturnType<typeof vi.fn>
    pushState: ReturnType<typeof vi.fn>
}

function installTestWindow() {
    const popStateHandlers: Array<() => void> = []
    const history: TestHistory = {
        go: vi.fn(() => queueMicrotask(() => popStateHandlers.forEach((handler) => handler()))),
        pushState: vi.fn(),
    }
    const testWindow = {
        addEventListener: (type: string, handler: () => void) => {
            if (type === 'popstate') popStateHandlers.push(handler)
        },
        history,
    }
    Object.defineProperty(globalThis, 'window', { configurable: true, value: testWindow, writable: true })

    return {
        history,
        pressBack: () => popStateHandlers.forEach((handler) => handler()),
    }
}

async function flushMicrotasks() {
    await Promise.resolve()
    await Promise.resolve()
}

function createService() {
    const owner = new PopupDataService()
    const mobileBackDismissService = new MobileBackDismissService()
    const service = new CardPopupService(owner as unknown as DataService, mobileBackDismissService)
    services.push(service)

    return { mobileBackDismissService, owner, service }
}

function actionContext(cardInternalId: string): ActionContext {
    return { cardInternalId, file: `design/${cardInternalId}.md`, kind: 'card' }
}

function projectActionContext(): ActionContext {
    return { kind: 'project' }
}

function anchor() {
    return document.createElement('button')
}

beforeEach(() => {
    testWindow = installTestWindow()
})

afterEach(async () => {
    services.forEach((service) => service.setMobileBackDismissEnabled(false))
    services.forEach((service) => service.clear())
    await flushMicrotasks()
    services.length = 0
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow, writable: true })
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

    it('keeps toggle action entries without a requested action run', () => {
        const { service } = createService()

        service.toggleAction(actionContext('card-1'), anchor())

        expect(service.getSnapshot()[0]).toMatchObject({
            kind: 'action',
            requestedActionId: null,
            requestedRunId: null,
        })
    })

    it('replaces and reactivates an existing card action popup for a requested run', () => {
        const { service } = createService()
        service.toggleAction(actionContext('card-1'), anchor())
        const replacedEntry = service.getSnapshot()[0]
        service.toggleAction(actionContext('card-2'), anchor())

        service.openActionRun(actionContext('card-1'), 'review', 'run-7', anchor())

        expect(replacedEntry.fallbackAnchorElement.isConnected).toBe(false)
        expect(service.getSnapshot()).toHaveLength(2)
        expect(service.getSnapshot().at(-1)).toMatchObject({
            context: { cardInternalId: 'card-1' },
            kind: 'action',
            requestedActionId: 'review',
            requestedRunId: 'run-7',
        })
        expect(service.getSnapshot().at(-1)?.id).not.toBe(replacedEntry.id)
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

    it('shows existing card details without toggling them closed', () => {
        const { service } = createService()
        const firstAnchor = anchor()
        service.showCardDetails('card-1', firstAnchor)
        const firstEntry = service.getSnapshot()[0]
        service.toggleAction(actionContext('card-2'), anchor())

        service.showCardDetails('card-1', anchor())

        expect(service.getSnapshot()).toHaveLength(2)
        expect(service.getSnapshot().at(-1)).toMatchObject({ id: firstEntry.id, kind: 'card-details' })
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

    it('toggles a project popup open and closed without duplicating its entry', () => {
        const { service } = createService()

        service.toggleAction(projectActionContext(), anchor())

        expect(service.getSnapshot()).toHaveLength(1)
        expect(service.getSnapshot()[0]).toMatchObject({ context: { kind: 'project' }, kind: 'action' })

        service.toggleAction(projectActionContext(), anchor())

        expect(service.getSnapshot()).toEqual([])
    })

    it('closes a project popup by context and stays a no-op when none is open', () => {
        const { service } = createService()

        service.closeAction(projectActionContext())

        expect(service.getSnapshot()).toEqual([])

        service.toggleAction(projectActionContext(), anchor())
        service.toggleAction(actionContext('card-1'), anchor())
        service.closeAction(projectActionContext())

        expect(service.getSnapshot()).toHaveLength(1)
        expect(service.getSnapshot()[0]).toMatchObject({ context: { cardInternalId: 'card-1' } })

        service.closeAction(projectActionContext())

        expect(service.getSnapshot()).toHaveLength(1)
    })

    it('still rejects a card action popup without a card internal ID', () => {
        const { service } = createService()

        expect(() => service.toggleAction({ kind: 'card' }, anchor()))
            .toThrow('Cannot open a card action popup without a card internal ID')
    })

    it('raises a project popup above card popups on activation', () => {
        const { service } = createService()
        service.toggleAction(projectActionContext(), anchor())
        const projectEntry = service.getSnapshot()[0]
        service.toggleAction(actionContext('card-1'), anchor())

        service.activate(projectEntry.id)

        expect(service.getSnapshot().at(-1)).toBe(projectEntry)
    })

    it('clears a project popup when project identity changes', () => {
        const { owner, service } = createService()
        service.toggleAction(projectActionContext(), anchor())
        owner.project = { branch: 'feature', id: 'project-1' }

        owner.dispatchEvent(new Event('changed'))

        expect(service.getSnapshot()).toEqual([])
    })

    it('registers only while mobile back dismissal is enabled', async () => {
        const { mobileBackDismissService, service } = createService()
        service.toggleCardDetails('card-1', anchor())

        expect(mobileBackDismissService.getRegistrationCount()).toBe(0)

        service.setMobileBackDismissEnabled(true)
        expect(mobileBackDismissService.getRegistrationCount()).toBe(1)

        service.setMobileBackDismissEnabled(false)
        await flushMicrotasks()
        expect(mobileBackDismissService.getRegistrationCount()).toBe(0)

        service.setMobileBackDismissEnabled(true)
        expect(mobileBackDismissService.getRegistrationCount()).toBe(1)
    })

    it('closes the current top popup after activation on each back press', async () => {
        const { mobileBackDismissService, service } = createService()
        service.setMobileBackDismissEnabled(true)
        service.toggleCardDetails('card-1', anchor())
        service.toggleCardDetails('card-2', anchor())
        const [firstEntry, secondEntry] = service.getSnapshot()
        service.activate(firstEntry.id)

        testWindow.pressBack()
        await flushMicrotasks()

        expect(service.getSnapshot()).toEqual([secondEntry])
        expect(mobileBackDismissService.getRegistrationCount()).toBe(1)

        testWindow.pressBack()
        await flushMicrotasks()

        expect(service.getSnapshot()).toEqual([])
        expect(mobileBackDismissService.getRegistrationCount()).toBe(0)
    })

    it('returns several registrations in one history move when popups clear', async () => {
        const { mobileBackDismissService, service } = createService()
        service.setMobileBackDismissEnabled(true)
        service.toggleCardDetails('card-1', anchor())
        service.toggleCardDetails('card-2', anchor())

        service.clear()
        await flushMicrotasks()

        expect(mobileBackDismissService.getRegistrationCount()).toBe(0)
        expect(testWindow.history.go).toHaveBeenCalledExactlyOnceWith(-2)
    })

    it('returns popup registrations when project identity changes', async () => {
        const { owner, service, mobileBackDismissService } = createService()
        service.setMobileBackDismissEnabled(true)
        service.toggleCardDetails('card-1', anchor())
        owner.project = { branch: 'feature', id: 'project-1' }

        owner.dispatchEvent(new Event('changed'))
        await flushMicrotasks()

        expect(service.getSnapshot()).toEqual([])
        expect(mobileBackDismissService.getRegistrationCount()).toBe(0)
    })
})
