import { afterEach, describe, expect, it, vi } from 'vitest'
import { CARD_PATH_CHANGED_EVENT, dataService, type CardPathChangedEventDetail } from '../../services/data/data_service'
import { cardBodyPopoverService } from './card_body_popover_service'

function publishCardPathChange(fromPath: string, toPath: string) {
    const detail: CardPathChangedEventDetail = { fromPath, toPath }
    dataService.dispatchEvent(new CustomEvent<CardPathChangedEventDetail>(CARD_PATH_CHANGED_EVENT, { detail }))
}

describe('CardBodyPopoverService', () => {
    afterEach(() => {
        cardBodyPopoverService.close()
    })

    it('opens a card with its anchor and notifies subscribers', () => {
        const changed = vi.fn()
        const anchorElement = document.createElement('button')
        cardBodyPopoverService.addEventListener('changed', changed, { once: true })

        cardBodyPopoverService.toggle('design/F-1.md', anchorElement)

        expect(cardBodyPopoverService.getSnapshot()).toEqual({ anchorElement, cardPath: 'design/F-1.md', diffSelection: null })
        expect(changed).toHaveBeenCalledOnce()
    })

    it('closes when the open card is toggled again', () => {
        const anchorElement = document.createElement('button')
        cardBodyPopoverService.toggle('design/F-1.md', anchorElement)

        cardBodyPopoverService.toggle('design/F-1.md', anchorElement)

        expect(cardBodyPopoverService.getSnapshot()).toEqual({ anchorElement: null, cardPath: null, diffSelection: null })
    })

    it('switches directly to another card', () => {
        const firstAnchor = document.createElement('button')
        const secondAnchor = document.createElement('button')
        cardBodyPopoverService.toggle('design/F-1.md', firstAnchor)

        cardBodyPopoverService.toggle('design/F-2.md', secondAnchor)

        expect(cardBodyPopoverService.getSnapshot()).toEqual({ anchorElement: secondAnchor, cardPath: 'design/F-2.md', diffSelection: null })
    })

    it('closes only when the matching path is requested', () => {
        const anchorElement = document.createElement('button')
        cardBodyPopoverService.toggle('design/F-1.md', anchorElement)

        cardBodyPopoverService.closePath('design/F-2.md')
        expect(cardBodyPopoverService.getSnapshot().cardPath).toBe('design/F-1.md')

        cardBodyPopoverService.closePath('design/F-1.md')
        expect(cardBodyPopoverService.getSnapshot()).toEqual({ anchorElement: null, cardPath: null, diffSelection: null })
    })

    it('stays open on the renamed card file', () => {
        const anchorElement = document.createElement('button')
        cardBodyPopoverService.toggle('design/F-1.md', anchorElement)

        publishCardPathChange('design/F-2.md', 'design/F-2-renamed.md')
        expect(cardBodyPopoverService.getSnapshot().cardPath).toBe('design/F-1.md')

        publishCardPathChange('design/F-1.md', 'design/F-1-renamed.md')
        expect(cardBodyPopoverService.getSnapshot()).toEqual({ anchorElement, cardPath: 'design/F-1-renamed.md', diffSelection: null })
    })

    it('opens and clears current worktree diff on same card popup', () => {
        const anchorElement = document.createElement('button')

        cardBodyPopoverService.openWorktreeDiff('design/F-1.md', anchorElement)
        expect(cardBodyPopoverService.getSnapshot()).toEqual({
            anchorElement,
            cardPath: 'design/F-1.md',
            diffSelection: { kind: 'worktree' },
        })

        cardBodyPopoverService.clearDiff()
        expect(cardBodyPopoverService.getSnapshot().diffSelection).toBeNull()
    })
})
