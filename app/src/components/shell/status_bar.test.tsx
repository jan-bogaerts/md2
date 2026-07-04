import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StatusBar } from './status_bar'

describe('StatusBar', () => {
    afterEach(cleanup)

    it('renders keyboard status and the agents indicator', () => {
        render(<StatusBar agents={[]} info="" onInfoChange={vi.fn()} />)

        expect(screen.getByText('Caps Off')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Running agents: 0' })).toBeInTheDocument()
    })

    it('edits the info field', () => {
        const onInfoChange = vi.fn()
        render(<StatusBar agents={[]} info="" onInfoChange={onInfoChange} />)

        fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'Ready' } })

        expect(onInfoChange).toHaveBeenCalledWith('Ready')
    })
})
