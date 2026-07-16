import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition, ActionFile } from '../../data/action_types'
import { configService } from '../../services/config_service'
import { dataService } from '../../services/data_service'
import { actionService } from '../../services/action_service'
import * as actionServiceModule from '../../services/action_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { flushMarkdownEditors } from '../editor/markdown_editor_flush'
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

function renderEditor(action: ActionDefinition = loadAction(), states = ['ready']): RenderResult {
    return render(
        <AppThemeProvider>
            <ActionEditor
                action={action}
                actions={actionService.getActions()}
                cardTypes={['feature']}
                repositoryFiles={[]}
                specialContextTypes={['actions']}
                states={states}
            />
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

        expect(screen.getByRole('tab', { name: 'Definition' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Prompt' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Add predefined phrase' })).toBeInTheDocument()
        expect(screen.queryByLabelText('Command')).not.toBeInTheDocument()

        fireEvent.mouseDown(screen.getByLabelText('Type'))
        fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Command' }))

        expect(screen.getByLabelText('Command')).toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Prompt' })).not.toBeInTheDocument()
    })

    it('renders persisted initial values for agent and command actions', () => {
        const agentView = renderEditor(loadAction({
            agent: 'codex',
            model: 'gpt-5',
            thinkingLevel: 'high',
        }))

        expect(screen.getByLabelText('ID')).toHaveValue('review-action')
        expect(screen.getByLabelText('Name')).toHaveValue('review')
        expect(screen.getByLabelText('Label')).toHaveValue('Review')
        expect(screen.getByLabelText('Description')).toHaveValue('Review the selected file')
        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        expect(within(screen.getByTestId('mdx-editor')).getByRole('textbox')).toHaveValue('Review {{file}}')

        agentView.unmount()
        renderEditor(loadAction({ command: 'npm run test', prompt: undefined, type: 'command' }))

        expect(screen.getByLabelText('Command')).toHaveValue('npm run test')
        expect(screen.queryByTestId('mdx-editor')).not.toBeInTheDocument()
    })

    it('shows a stale onState value as unavailable without an out-of-range warning', () => {
        const consoleWarning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        renderEditor(loadAction({ onState: 'removed' }))

        expect(screen.getByLabelText('Run when card enters state')).toHaveTextContent('removed — unavailable')
        expect(screen.getByText('State "removed" no longer exists. This trigger cannot run until cleared or replaced.')).toBeInTheDocument()
        fireEvent.mouseDown(screen.getByLabelText('Run when card enters state'))
        expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'removed — unavailable' })).toBeInTheDocument()
        expect(consoleWarning.mock.calls.some(([message]) => String(message).includes('out-of-range value'))).toBe(false)
    })

    it('keeps a stored onState visible when no states are configured', () => {
        renderEditor(loadAction({ onState: 'removed' }), [])

        expect(screen.getByLabelText('Run when card enters state')).toHaveTextContent('removed — unavailable')
        expect(screen.getByText(/This trigger cannot run until cleared or replaced/u)).toBeInTheDocument()
    })

    it('marks the selected onState unavailable after a state config reload', () => {
        const action = loadAction({ onState: 'ready' })
        const view = renderEditor(action)

        expect(screen.getByLabelText('Run when card enters state')).toHaveTextContent('ready')
        expect(screen.queryByText(/This trigger cannot run until cleared or replaced/u)).not.toBeInTheDocument()

        view.rerender(
            <AppThemeProvider>
                <ActionEditor
                    action={action}
                    actions={actionService.getActions()}
                    cardTypes={['feature']}
                    repositoryFiles={[]}
                    specialContextTypes={['actions']}
                    states={['done']}
                />
            </AppThemeProvider>,
        )

        expect(screen.getByLabelText('Run when card enters state')).toHaveTextContent('ready — unavailable')
        expect(screen.getByText(/This trigger cannot run until cleared or replaced/u)).toBeInTheDocument()
    })

    it('clears a stale onState through the selector', async () => {
        vi.useFakeTimers()
        const action = loadAction({ onState: 'removed' })
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition').mockResolvedValue(action)
        renderEditor(action)

        fireEvent.mouseDown(screen.getByLabelText('Run when card enters state'))
        fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'No state trigger' }))

        expect(screen.queryByText(/This trigger cannot run until cleared or replaced/u)).not.toBeInTheDocument()
        await act(async () => vi.advanceTimersByTime(600))
        expect(saveDefinition.mock.calls[0][1].onState).toBeUndefined()
    })

    it('replaces a stale onState with a configured state', () => {
        renderEditor(loadAction({ onState: 'removed' }))

        fireEvent.mouseDown(screen.getByLabelText('Run when card enters state'))
        fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'ready' }))

        expect(screen.getByRole('combobox', { name: 'Run when card enters state' })).toHaveTextContent('ready')
        expect(screen.queryByText(/This trigger cannot run until cleared or replaced/u)).not.toBeInTheDocument()
    })

    it('shows the actual validation error and does not save invalid state', async () => {
        vi.useFakeTimers()
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition')
        renderEditor()
        const parse = vi.spyOn(JSON, 'parse')
        const serialize = vi.spyOn(actionServiceModule, 'serializeActionDefinition')

        fireEvent.change(labelInput(), { target: { value: ' \t\u2003' } })
        expect(screen.getByText(/Missing action field label/u)).toBeInTheDocument()

        await act(async () => vi.advanceTimersByTime(600))
        expect(saveDefinition).not.toHaveBeenCalled()
        expect(parse).not.toHaveBeenCalled()
        expect(serialize).not.toHaveBeenCalled()
    })

    it('moves from invalid back to valid and auto-saves the repaired draft', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition').mockResolvedValue(action)
        renderEditor(action)

        fireEvent.change(labelInput(), { target: { value: '   ' } })
        expect(screen.getByText('Fix validation errors to save.')).toBeInTheDocument()

        fireEvent.change(labelInput(), { target: { value: 'Review repaired' } })
        expect(screen.getByText('Changes save automatically.')).toBeInTheDocument()
        await act(async () => vi.advanceTimersByTime(600))

        expect(saveDefinition).toHaveBeenCalledWith(
            'actions/review.json',
            expect.objectContaining({ label: 'Review repaired' }),
        )
    })

    it('saves a flushed prompt edit', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition').mockResolvedValue(action)
        renderEditor(action)

        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        fireEvent.change(within(screen.getByTestId('mdx-editor')).getByRole('textbox'), {target: { value: 'Updated prompt' }})
        act(() => flushMarkdownEditors())
        await act(async () => vi.advanceTimersByTime(600))

        expect(saveDefinition).toHaveBeenCalledWith(
            'actions/review.json',
            expect.objectContaining({ prompt: 'Updated prompt' }),
        )
    })

    it('adds, edits, auto-saves, and deletes a predefined phrase', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition').mockResolvedValue(action)
        renderEditor(action)

        fireEvent.click(screen.getByRole('tab', { name: 'Add predefined phrase' }))
        expect(screen.getByLabelText('Phrase title')).toHaveValue('')
        expect(screen.getByRole('button', { name: 'Delete this predefined phrase' })).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('Phrase title'), { target: { value: 'Run tests' } })
        fireEvent.change(within(screen.getByTestId('mdx-editor')).getAllByRole('textbox')[1], { target: { value: '**Run all tests**' } })
        act(() => flushMarkdownEditors())
        await act(async () => vi.advanceTimersByTime(600))

        expect(screen.getByRole('tab', { name: 'Run tests' })).toBeInTheDocument()
        expect(saveDefinition).toHaveBeenLastCalledWith(
            'actions/review.json',
            expect.objectContaining({ phrases: [{ text: '**Run all tests**', title: 'Run tests' }] }),
        )

        fireEvent.click(screen.getByRole('button', { name: 'Delete this predefined phrase' }))
        await act(async () => vi.advanceTimersByTime(600))

        expect(screen.queryByRole('tab', { name: 'Run tests' })).not.toBeInTheDocument()
        expect(saveDefinition).toHaveBeenLastCalledWith(
            'actions/review.json',
            expect.objectContaining({ phrases: [] }),
        )
    })

    it('uses phrase titles or truncated first Markdown lines as tab labels', () => {
        renderEditor(loadAction({
            phrases: [
                { text: 'Ignored text', title: 'Named phrase' },
                { text: 'Quick follow-up\nMore detail', title: '' },
                { text: 'This first line is long enough to need truncation', title: '' },
            ],
        }))

        expect(screen.getByRole('tab', { name: 'Named phrase' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Quick follow-up' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'This first line is long enougâ€¦' })).toBeInTheDocument()
    })

    it('returns to the prompt when an external reload removes the selected phrase', () => {
        const action = loadAction({ phrases: [{ text: 'Run tests', title: 'Tests' }] })
        const view = renderEditor(action)
        fireEvent.click(screen.getByRole('tab', { name: 'Tests' }))
        expect(screen.getByRole('tab', { name: 'Tests' })).toHaveAttribute('aria-selected', 'true')

        const externalAction = loadAction({ phrases: [] })
        view.rerender(
            <AppThemeProvider>
                <ActionEditor
                    action={externalAction}
                    actions={actionService.getActions()}
                    cardTypes={['feature']}
                    repositoryFiles={[]}
                    specialContextTypes={['actions']}
                    states={['ready']}
                />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('tab', { name: 'Prompt' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.queryByRole('tab', { name: 'Tests' })).not.toBeInTheDocument()
    })

    it('does not save while a newly added filter value is empty', async () => {
        vi.useFakeTimers()
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition')
        renderEditor()

        fireEvent.click(screen.getByRole('button', { name: 'Add filter' }))
        fireEvent.change(labelInput(), { target: { value: 'Review code' } })

        await act(async () => vi.advanceTimersByTime(600))
        expect(saveDefinition).not.toHaveBeenCalled()
    })

    it('shows a general summary for definition-level errors with no routable field', () => {
        const action = loadAction()
        // A cycle/definition error has no single field; the editor surfaces it as a summary alert.
        vi.spyOn(actionService, 'validateDefinition').mockReturnValue({code: 'circular-reference', error: 'Circular action reference: a -> b -> a', field: null, fieldPath: null, index: null, valid: false})
        renderEditor(action)

        expect(screen.getByRole('alert')).toHaveTextContent('Circular action reference: a -> b -> a')
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

    it('persists and publishes an edit through the real action service', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        const persistActionFile = vi.spyOn(dataService, 'persistActionFile').mockResolvedValue(undefined)
        const changed = vi.fn()
        actionService.addEventListener('changed', changed)
        renderEditor(action)

        fireEvent.change(labelInput(), { target: { value: 'Published label' } })
        await act(async () => vi.advanceTimersByTime(600))

        expect(persistActionFile).toHaveBeenCalledWith({
            content: expect.stringContaining('"label": "Published label"'),
            path: 'actions/review.json',
        })
        expect(actionService.getActionByPath('actions/review.json')?.label).toBe('Published label')
        expect(changed).toHaveBeenCalledOnce()
        actionService.removeEventListener('changed', changed)
    })

    it('shows save failure status and retries the newest draft', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition')
            .mockRejectedValueOnce(new Error('disk unavailable'))
            .mockResolvedValueOnce(action)
        renderEditor(action)

        fireEvent.change(labelInput(), { target: { value: 'Retry this value' } })
        await act(async () => vi.advanceTimersByTime(600))

        expect(screen.getByRole('alert')).toHaveTextContent('disk unavailable')
        expect(screen.getByText('Save failed. Retry to save changes.')).toBeInTheDocument()

        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry save' })))

        expect(saveDefinition).toHaveBeenCalledTimes(2)
        expect(saveDefinition).toHaveBeenLastCalledWith(
            'actions/review.json',
            expect.objectContaining({ label: 'Retry this value' }),
        )
        expect(screen.queryByText('disk unavailable')).not.toBeInTheDocument()
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
                <ActionEditor
                    action={externalAction}
                    actions={actionService.getActions()}
                    cardTypes={['feature']}
                    repositoryFiles={[]}
                    specialContextTypes={['actions']}
                    states={['ready']}
                />
            </AppThemeProvider>,
        )

        expect(screen.getByText(/changed outside the editor/u)).toBeInTheDocument()
        expect(labelInput().value).toBe('Local edit')

        fireEvent.click(screen.getByRole('button', { name: 'Reload from disk' }))

        expect(screen.queryByText(/changed outside the editor/u)).not.toBeInTheDocument()
        expect(labelInput().value).toBe('Review')
        expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('External change')
    })

    it('adopts an external reload immediately while the draft is clean', () => {
        const action = loadAction()
        const view = renderEditor(action)
        const externalAction = loadAction({ label: 'External label' })

        view.rerender(
            <AppThemeProvider>
                <ActionEditor
                    action={externalAction}
                    actions={actionService.getActions()}
                    cardTypes={['feature']}
                    repositoryFiles={[]}
                    specialContextTypes={['actions']}
                    states={['ready']}
                />
            </AppThemeProvider>,
        )

        expect(labelInput()).toHaveValue('External label')
        expect(screen.queryByText(/changed outside the editor/u)).not.toBeInTheDocument()
    })

    it('treats property-order-only external reloads as clean structured state', () => {
        const action = loadAction()
        const view = renderEditor(action)
        const reorderedFile = {
            content: JSON.stringify({
                type: 'agent',
                prompt: definition.prompt,
                name: definition.name,
                label: definition.label,
                id: definition.id,
                description: definition.description,
            }),
            path: 'actions/review.json',
        }
        actionService.loadFromFiles([reorderedFile])
        const reloadedAction = actionService.getActionByPath('actions/review.json')
        if (!reloadedAction) throw new Error('Missing reloaded action')

        view.rerender(
            <AppThemeProvider>
                <ActionEditor
                    action={reloadedAction}
                    actions={actionService.getActions()}
                    cardTypes={['feature']}
                    repositoryFiles={[]}
                    specialContextTypes={['actions']}
                    states={['ready']}
                />
            </AppThemeProvider>,
        )

        expect(screen.queryByText(/changed outside the editor/u)).not.toBeInTheDocument()
        expect(labelInput().value).toBe('Review')
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
