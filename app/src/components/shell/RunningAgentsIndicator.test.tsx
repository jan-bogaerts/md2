import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RunningAgentsIndicator } from './RunningAgentsIndicator'

describe('RunningAgentsIndicator', () => {
    afterEach(cleanup)

    it('reports the running-agent count', () => {
        render(<RunningAgentsIndicator agents={[{ id: 'a', label: 'Build' }, { id: 'b', label: 'Lint' }]} />)

        expect(screen.getByRole('button', { name: 'Running agents: 2' })).toBeInTheDocument()
    })

    it('lists the running agents in a popover', () => {
        render(<RunningAgentsIndicator agents={[{ id: 'a', label: 'Build docs' }]} />)

        fireEvent.click(screen.getByRole('button', { name: 'Running agents: 1' }))

        expect(screen.getByText('Build docs')).toBeInTheDocument()
    })

    it('shows an empty message when no agents run', () => {
        render(<RunningAgentsIndicator agents={[]} />)

        fireEvent.click(screen.getByRole('button', { name: 'Running agents: 0' }))

        expect(screen.getByText('No agents running')).toBeInTheDocument()
    })
})
