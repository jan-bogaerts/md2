import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition, ActionFile } from '../../data/action_types'
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

interface Deferred<T> {
    promise: Promise<T>
    reject: (reason?: unknown) => void
    resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })

    return { promise, reject, resolve }
}

function file(overrides: Record<string, unknown> = {}): ActionFile {
    return { content: JSON.stringify({ ...definition, ...overrides }), path: 'actions/review.json' }
}

function loadAction(overrides: Record<string, unknown> = {}): ActionDefinition {
    actionService.loadFromFiles([file(overrides)])
    const action = actionService.getActionByPath('actions/review.json')
    if (!action) throw new Error('Missing test action')

    return action
}

function renderEditor(action: ActionDefinition = loadAction()): RenderResult {
    return render(
        <AppThemeProvider>
            <ActionEditor action={action} actions={actionService.getActions()} repositoryFiles={[]} states={['ready']} />
        </AppThemeProvider>,
    )
}

function labelInput(): HTMLInputElement {
    return screen.getByLabelText('Label') as HTMLInputElement
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

        fireEvent.change(labelInput(), { target: { value: '' } })
        expect(screen.getByText(/Missing action field label/u)).toBeInTheDocument()

        await act(async () => vi.advanceTimersByTime(600))
        expect(saveDefinition).not.toHaveBeenCalled()
    })

    it('auto-saves valid structured changes', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition').mockResolvedValue(action)
        renderEditor(action)

        fireEvent.change(labelInput(), { target: { value: 'Review code' } })
        await act(async () => vi.advanceTimersByTime(600))

        expect(saveDefinition).toHaveBeenCalledWith(
            'actions/review.json',
            expect.objectContaining({ id: 'review-action', label: 'Review code' }),
        )
    })

    it('does not let an in-flight save overwrite or cancel newer typing', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        const saves: Deferred<ActionDefinition>[] = []
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition').mockImplementation(() => {
            const pending = deferred<ActionDefinition>()
            saves.push(pending)

            return pending.promise
        })
        renderEditor(action)

        fireEvent.change(labelInput(), { target: { value: 'Review code' } })
        await act(async () => vi.advanceTimersByTime(600))
        expect(saveDefinition).toHaveBeenCalledTimes(1)

        // Type again while the first save is still in flight.
        fireEvent.change(labelInput(), { target: { value: 'Review code 2' } })
        // Completing the first (stale) save must not revert the newer draft.
        await act(async () => saves[0].resolve(action))
        expect(labelInput().value).toBe('Review code 2')

        await act(async () => vi.advanceTimersByTime(600))
        expect(saveDefinition).toHaveBeenLastCalledWith(
            'actions/review.json',
            expect.objectContaining({ label: 'Review code 2' }),
        )
    })

    it('ignores a stale save failure superseded by a newer save', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        const saves: Deferred<ActionDefinition>[] = []
        vi.spyOn(actionService, 'saveDefinition').mockImplementation(() => {
            const pending = deferred<ActionDefinition>()
            saves.push(pending)

            return pending.promise
        })
        renderEditor(action)

        fireEvent.change(labelInput(), { target: { value: 'Review code' } })
        await act(async () => vi.advanceTimersByTime(600))

        // Queue a newer save behind the first one, then fail the first one.
        fireEvent.change(labelInput(), { target: { value: 'Review code 2' } })
        await act(async () => vi.advanceTimersByTime(600))
        await act(async () => saves[0].reject(new Error('stale boom')))

        // The stale failure is not the newest revision, so no error is surfaced.
        expect(screen.queryByText(/stale boom/u)).not.toBeInTheDocument()

        // The newer save runs and succeeds.
        await act(async () => saves[1].resolve(action))
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('flushes a pending valid draft when the editor unmounts', async () => {
        const action = loadAction()
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition').mockResolvedValue(action)
        const view = renderEditor(action)

        fireEvent.change(labelInput(), { target: { value: 'Review code' } })
        // Unmount before the debounce elapses; the pending draft must still be saved.
        await act(async () => view.unmount())

        expect(saveDefinition).toHaveBeenCalledWith(
            'actions/review.json',
            expect.objectContaining({ label: 'Review code' }),
        )
    })

    it('shows a conflict and requires explicit resolution on external change while dirty', () => {
        vi.spyOn(actionService, 'saveDefinition').mockReturnValue(deferred<ActionDefinition>().promise)
        const action = loadAction()
        const view = renderEditor(action)

        fireEvent.change(labelInput(), { target: { value: 'Local edit' } })

        // An external change arrives while the draft is dirty.
        const externalAction = loadAction({ description: 'External change' })
        view.rerender(
            <AppThemeProvider>
                <ActionEditor action={externalAction} actions={actionService.getActions()} repositoryFiles={[]} states={['ready']} />
            </AppThemeProvider>,
        )

        expect(screen.getByText(/changed outside the editor/u)).toBeInTheDocument()
        expect(labelInput().value).toBe('Local edit')

        fireEvent.click(screen.getByRole('button', { name: 'Reload from disk' }))

        expect(screen.queryByText(/changed outside the editor/u)).not.toBeInTheDocument()
        expect(labelInput().value).toBe('Review')
        expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('External change')
    })

    it('does not remount the editor or lose focus on a successful save', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        vi.spyOn(actionService, 'saveDefinition').mockResolvedValue(action)
        renderEditor(action)

        const before = labelInput()
        before.focus()
        fireEvent.change(before, { target: { value: 'Review code' } })
        await act(async () => vi.advanceTimersByTime(600))

        const after = labelInput()
        expect(after).toBe(before)
        expect(document.activeElement).toBe(after)
        expect(after.value).toBe('Review code')
    })
})
