import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { KeyboardStatus } from './keyboard_status'

function dispatchKeyDown(init: KeyboardEventInit, capsLock = false) {
    const event = new KeyboardEvent('keydown', init)
    Object.defineProperty(event, 'getModifierState', { value: () => capsLock })
    act(() => {
        window.dispatchEvent(event)
    })
}

describe('KeyboardStatus', () => {
    afterEach(cleanup)

    it('does not show a keyboard indicator by default', () => {
        render(<KeyboardStatus />)

        expect(screen.queryByText('CAPS')).not.toBeInTheDocument()
        expect(screen.queryByText('INS')).not.toBeInTheDocument()
        expect(screen.queryByText('OVR')).not.toBeInTheDocument()
    })

    it('reflects the caps lock modifier state', () => {
        render(<KeyboardStatus />)

        dispatchKeyDown({ key: 'a' }, true)

        expect(screen.getByText('CAPS')).toBeInTheDocument()
    })
})
