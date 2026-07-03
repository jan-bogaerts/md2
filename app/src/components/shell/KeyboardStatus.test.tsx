import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { KeyboardStatus } from './KeyboardStatus'

function dispatchKeyDown(init: KeyboardEventInit, capsLock = false) {
    const event = new KeyboardEvent('keydown', init)
    Object.defineProperty(event, 'getModifierState', { value: () => capsLock })
    act(() => {
        window.dispatchEvent(event)
    })
}

describe('KeyboardStatus', () => {
    afterEach(cleanup)

    it('shows caps and insert as off by default', () => {
        render(<KeyboardStatus />)

        expect(screen.getByText('Caps Off')).toBeInTheDocument()
        expect(screen.getByText('INS')).toBeInTheDocument()
    })

    it('reflects the caps lock modifier state', () => {
        render(<KeyboardStatus />)

        dispatchKeyDown({ key: 'a' }, true)

        expect(screen.getByText('Caps On')).toBeInTheDocument()
    })

    it('toggles overwrite mode when Insert is pressed', () => {
        render(<KeyboardStatus />)

        dispatchKeyDown({ key: 'Insert' })

        expect(screen.getByText('OVR')).toBeInTheDocument()
    })
})
