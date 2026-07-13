import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionFile } from '../../data/action_types'
import { configService } from '../../services/config_service'
import { actionService } from '../../services/action_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionEditor } from './action_editor'

const definition = {
    description: 'Review the selected file',
    id: 'review-action',
    label: 'Review',
    name: 'review',
    prompt: 'Review {{file}}',
    type: 'agent',
}

function file(): ActionFile {
    return { content: JSON.stringify(definition), path: 'actions/review.json' }
}

function renderEditor() {
    actionService.loadFromFiles([file()])
    const action = actionService.getActionByPath('actions/review.json')
    if (!action) throw new Error('Missing test action')

    render(
        <AppThemeProvider>
            <ActionEditor action={action} actions={actionService.getActions()} repositoryFiles={[]} states={['ready']} />
        </AppThemeProvider>,
    )
}

describe('ActionEditor', () => {
    beforeEach(() => {
        configService.init()
    })

    afterEach(() => {
        cleanup()
        actionService.clear()
        configService.clear()
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    it('shows type-specific structured controls', () => {
        renderEditor()

        expect(screen.getByRole('heading', { name: 'Prompt' })).toBeInTheDocument()
        expect(screen.queryByLabelText('Command')).not.toBeInTheDocument()

        fireEvent.mouseDown(screen.getByLabelText('Type'))
        fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Command' }))

        expect(screen.getByLabelText('Command')).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Prompt' })).not.toBeInTheDocument()
    })

    it('shows the actual validation error and does not save invalid state', async () => {
        vi.useFakeTimers()
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition')
        renderEditor()

        fireEvent.change(screen.getByLabelText('Label'), { target: { value: '' } })
        expect(screen.getByText(/Missing action field label/u)).toBeInTheDocument()

        await act(async () => vi.advanceTimersByTime(600))
        expect(saveDefinition).not.toHaveBeenCalled()
    })

    it('auto-saves valid structured changes', async () => {
        vi.useFakeTimers()
        renderEditor()
        const action = actionService.getActionByPath('actions/review.json')
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition').mockImplementation(async () => {
            if (!action) throw new Error('Missing test action')
            return action
        })

        fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Review code' } })
        await act(async () => vi.advanceTimersByTime(600))

        expect(saveDefinition).toHaveBeenCalledWith(
            'actions/review.json',
            expect.objectContaining({ id: 'review-action', label: 'Review code' }),
        )
    })
})
