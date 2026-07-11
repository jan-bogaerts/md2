import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusBar } from './status_bar'

describe('StatusBar', () => {
    afterEach(cleanup)

    it('renders card counts, keyboard status and the agents indicator', () => {
        render(<StatusBar activeCardCount={2} agents={[]} hasPendingPush={false} hasPendingSave={false} totalCardCount={5} />)

        expect(screen.getByText('5')).toBeInTheDocument()
        expect(screen.getByText('cards')).toBeInTheDocument()
        expect(screen.getByText('2')).toBeInTheDocument()
        expect(screen.getByText('active')).toBeInTheDocument()
        expect(screen.getByText('Saved locally')).toBeInTheDocument()
        expect(screen.getByText('Synced')).toBeInTheDocument()
        expect(screen.getByText('INS')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Running agents: 0' })).toBeInTheDocument()
    })

    it('does not render an editable status input', () => {
        render(<StatusBar activeCardCount={0} agents={[]} hasPendingPush={false} hasPendingSave={false} totalCardCount={0} />)

        expect(screen.queryByRole('textbox', { name: 'Status' })).toBeNull()
    })

    it('shows local saving and pending push independently', () => {
        render(<StatusBar activeCardCount={0} agents={[]} hasPendingPush hasPendingSave totalCardCount={0} />)

        expect(screen.getByText('Saving changes...')).toBeInTheDocument()
        expect(screen.getByText('Changes ready to push')).toBeInTheDocument()
    })
})
