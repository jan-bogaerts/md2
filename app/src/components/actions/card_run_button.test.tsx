import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cardContext } from '../../data/action_context'
import type { ActionFile } from '../../data/action_types'
import { DEFAULT_CARD_TYPES, type ProjectCard } from '../../data/data_types'
import { actionService } from '../../services/action_service'
import { CardRunButton } from './card_run_button'

function file(definition: { id: string }): ActionFile {
    return { content: JSON.stringify(definition), path: `actions/${definition.id}.json` }
}

function commandDefinition(id: string, overrides: Record<string, unknown> = {}) {
    return { command: 't', description: id, id, label: id, type: 'command', ...overrides }
}

function agentDefinition(id: string, overrides: Record<string, unknown> = {}) {
    return { description: id, id, label: id, prompt: 't', type: 'agent', ...overrides }
}

const card: ProjectCard = {
    agentConversationErrors: [],
    agentConversations: [],
    content: '',
    headerFields: {},
    header: {
        affects: [], after: null, agentLogReferences: [], author: null, id: 'F-010', internalId: 'f-010', owner: null,
        policy: {}, status: 'design', title: 'Feature',
    },
    isActive: true,
    path: 'design/F-010.md',
}

describe('CardRunButton', () => {
    const onConversationViewed = vi.fn()

    beforeEach(() => {
        actionService.loadFromFiles([
            file(commandDefinition('branch', { label: 'Create branch' })),
            file(commandDefinition('lint', { description: 'Lint', label: 'Run lint' })),
            file(agentDefinition('implement', {appliesTo: { type: 'feature' }, description: 'Implement', label: 'Implement', onAfter: ['lint'], onBefore: ['branch']})),
        ])
    })

    afterEach(() => {
        cleanup()
        actionService.clear()
        vi.restoreAllMocks()
    })

    it('shows one Run button and toggles the card action popup', () => {
        render(<CardRunButton context={cardContext(card, DEFAULT_CARD_TYPES)} onConversationViewed={onConversationViewed} />)

        const runButton = screen.getByRole('button', { name: 'Run' })
        fireEvent.click(runButton)

        const dialog = within(screen.getByRole('dialog'))
        const actionGroup = within(dialog.getByRole('group', { name: 'Actions' }))
        const actionButtons = actionGroup.getAllByRole('button')
        expect(actionButtons.map((button) => button.textContent)).toEqual(['Create branch', 'Run lint', 'Implement', 'Custom prompt'])
        expect(dialog.getByRole('button', { name: 'Implement' })).toHaveAttribute('aria-pressed', 'true')

        fireEvent.click(runButton)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('selects one action at a time inside the Run popup', () => {
        render(<CardRunButton context={cardContext(card, DEFAULT_CARD_TYPES)} onConversationViewed={onConversationViewed} />)

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))
        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        fireEvent.click(actionGroup.getByRole('button', { name: 'Run lint' }))

        expect(actionGroup.getByRole('button', { name: 'Run lint' })).toHaveAttribute('aria-pressed', 'true')
        expect(actionGroup.getByRole('button', { name: 'Implement' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('shows custom-action save controls from the Run popup', () => {
        render(<CardRunButton context={cardContext(card, DEFAULT_CARD_TYPES)} onConversationViewed={onConversationViewed} />)

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))
        const dialog = within(screen.getByRole('dialog'))
        fireEvent.click(dialog.getByRole('button', { name: 'Add action' }))

        expect(dialog.getByPlaceholderText('Prompt required')).toBeInTheDocument()
        expect(dialog.getByLabelText('Preset name')).toHaveFocus()
        expect(dialog.getByRole('button', { name: 'Run' })).toBeDisabled()
    })
})
