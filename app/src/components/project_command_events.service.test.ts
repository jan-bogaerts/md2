import { describe, expect, it, vi } from 'vitest'
import {
    OPEN_NEW_CARD_DIALOG_EVENT,
    requestOpenNewCardDialog,
    type OpenNewCardDialogDetail,
} from './project_command_events'

describe('project command events', () => {
    it('includes the launch column in new-card requests', () => {
        const listener = vi.fn()
        window.addEventListener(OPEN_NEW_CARD_DIALOG_EVENT, listener)

        requestOpenNewCardDialog('design')

        const event = listener.mock.calls[0][0] as CustomEvent<OpenNewCardDialogDetail>
        expect(event.detail).toEqual({ status: 'design' })
        window.removeEventListener(OPEN_NEW_CARD_DIALOG_EVENT, listener)
    })
})
