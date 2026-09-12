import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cardPopupService } from '../../services/card_popup_service'
import { MobileBackDismissService } from '../../services/mobile_back_dismiss_service'
import { useCardPopupBackDismiss } from './use_card_popup_back_dismiss'

function setScreenWidth(isMobile: boolean) {
    window.matchMedia = ((query: string) => ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches: isMobile,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
    })) as unknown as typeof window.matchMedia
}

function BackDismissHost({ service }: { service: MobileBackDismissService }) {
    useCardPopupBackDismiss(service)

    return null
}

function openCardDetails(cardInternalId: string) {
    const anchorElement = document.createElement('button')
    document.body.append(anchorElement)
    act(() => cardPopupService.toggleCardDetails(cardInternalId, anchorElement))
}

async function pressBack() {
    await act(async () => {
        window.dispatchEvent(new PopStateEvent('popstate'))
        await Promise.resolve()
    })
}

async function flushPendingUnwinds() {
    await act(async () => {
        await Promise.resolve()
    })
}

describe('useCardPopupBackDismiss', () => {
    beforeEach(() => {
        // A real browser answers history.go with a popstate event, and the service relies on
        // seeing that event to know the move was its own; the stub has to do the same.
        vi.spyOn(window.history, 'go').mockImplementation(() => {
            queueMicrotask(() => window.dispatchEvent(new PopStateEvent('popstate')))
        })
        vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
    })

    afterEach(() => {
        cleanup()
        cardPopupService.clear()
        delete window.md2Lifecycle
        vi.restoreAllMocks()
    })

    it('closes one stacked popup per back press on a small screen in a browser', async () => {
        setScreenWidth(true)
        const service = new MobileBackDismissService()
        render(<BackDismissHost service={service} />)

        openCardDetails('card-one')
        openCardDetails('card-two')

        expect(service.getRegistrationCount()).toBe(2)
        expect(window.history.pushState).toHaveBeenCalledTimes(2)

        await pressBack()

        expect(cardPopupService.getSnapshot().map((entry) => entry.id)).toEqual(['card-details-popup-1'])
        expect(service.getRegistrationCount()).toBe(1)

        await pressBack()

        expect(cardPopupService.getSnapshot()).toEqual([])
        expect(service.getRegistrationCount()).toBe(0)
    })

    it('returns the history entries of popups closed without a back press', async () => {
        setScreenWidth(true)
        const service = new MobileBackDismissService()
        render(<BackDismissHost service={service} />)
        openCardDetails('card-one')
        openCardDetails('card-two')

        act(() => cardPopupService.clear())
        await flushPendingUnwinds()

        expect(service.getRegistrationCount()).toBe(0)
        expect(window.history.go).toHaveBeenCalledExactlyOnceWith(-2)
    })

    it('registers nothing on a wide screen', async () => {
        setScreenWidth(false)
        const service = new MobileBackDismissService()
        render(<BackDismissHost service={service} />)

        openCardDetails('card-one')

        await flushPendingUnwinds()
        expect(service.getRegistrationCount()).toBe(0)
        expect(window.history.pushState).not.toHaveBeenCalled()
    })

    it('registers nothing when the app runs in Electron', async () => {
        setScreenWidth(true)
        window.md2Lifecycle = {
            onFlushRequested: () => () => {},
            reportFlushResult: () => {},
        }
        const service = new MobileBackDismissService()
        render(<BackDismissHost service={service} />)

        openCardDetails('card-one')
        await flushPendingUnwinds()

        expect(service.getRegistrationCount()).toBe(0)
        expect(window.history.pushState).not.toHaveBeenCalled()
    })
})
