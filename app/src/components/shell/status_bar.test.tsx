import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusBar } from './status_bar'

describe('StatusBar', () => {
    afterEach(cleanup)

    it('renders card counts, keyboard status and the agents indicator', () => {
        render(<StatusBar activeCardCount={2} agents={[]} hasPendingCommits={false} totalCardCount={5} />)

        expect(screen.getByText('Total cards loaded: 5')).toBeInTheDocument()
        expect(screen.getByText('Currently active: 2')).toBeInTheDocument()
        expect(screen.getByText('Caps Off')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Running agents: 0' })).toBeInTheDocument()
    })

    it('does not render an editable status input', () => {
        render(<StatusBar activeCardCount={0} agents={[]} hasPendingCommits={false} totalCardCount={0} />)

        expect(screen.queryByRole('textbox', { name: 'Status' })).toBeNull()
    })

    it('shows pending commits as unsaved changes', () => {
        render(<StatusBar activeCardCount={0} agents={[]} hasPendingCommits totalCardCount={0} />)

        expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    })
})
