import { afterEach, describe, expect, it, vi } from 'vitest'
import { cardBodyPopoverService } from './card_body_popover_service'

describe('CardBodyPopoverService', () => {
    afterEach(() => {
        cardBodyPopoverService.close()
    })

    it('opens a card with its anchor and notifies subscribers', () => {
        const changed = vi.fn()
        const anchorElement = document.createElement('button')
        cardBodyPopoverService.addEventListener('changed', changed, { once: true })

        cardBodyPopoverService.toggle('design/F-1.md', anchorElement)

        expect(cardBodyPopoverService.getSnapshot()).toEqual({ anchorElement, cardPath: 'design/F-1.md' })
        expect(changed).toHaveBeenCalledOnce()
    })

    it('closes when the open card is toggled again', () => {
        const anchorElement = document.createElement('button')
        cardBodyPopoverService.toggle('design/F-1.md', anchorElement)

        cardBodyPopoverService.toggle('design/F-1.md', anchorElement)

        expect(cardBodyPopoverService.getSnapshot()).toEqual({ anchorElement: null, cardPath: null })
    })

    it('switches directly to another card', () => {
        const firstAnchor = document.createElement('button')
        const secondAnchor = document.createElement('button')
        cardBodyPopoverService.toggle('design/F-1.md', firstAnchor)

        cardBodyPopoverService.toggle('design/F-2.md', secondAnchor)

        expect(cardBodyPopoverService.getSnapshot()).toEqual({ anchorElement: secondAnchor, cardPath: 'design/F-2.md' })
    })

    it('closes only when the matching path is requested', () => {
        const anchorElement = document.createElement('button')
        cardBodyPopoverService.toggle('design/F-1.md', anchorElement)

        cardBodyPopoverService.closePath('design/F-2.md')
        expect(cardBodyPopoverService.getSnapshot().cardPath).toBe('design/F-1.md')

        cardBodyPopoverService.closePath('design/F-1.md')
        expect(cardBodyPopoverService.getSnapshot()).toEqual({ anchorElement: null, cardPath: null })
    })
})
