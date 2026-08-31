import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusBar } from './status_bar'

describe('StatusBar', () => {
    afterEach(cleanup)

    it('renders status indicators', () => {
        render(<StatusBar />)

        expect(screen.getByText('Saved locally')).toBeInTheDocument()
        expect(screen.getByText('Synced')).toBeInTheDocument()
        expect(screen.queryByText('INS')).not.toBeInTheDocument()
        expect(screen.queryByText('OVR')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Running agents: 0' })).toBeInTheDocument()
        expect(screen.queryByText(/Codex \d+% used/u)).not.toBeInTheDocument()
        expect(screen.queryByText(/Claude \d+% used/u)).not.toBeInTheDocument()
    })

    it('does not render an editable status input', () => {
        render(<StatusBar />)

        expect(screen.queryByRole('textbox', { name: 'Status' })).toBeNull()
    })
})
