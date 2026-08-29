import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { Box } from '@mui/material'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition, ActionFile, RawActionDefinition } from '../../../data/action_types'
import { configService } from '../../../services/config/config_service'
import { dataService } from '../../../services/data/data_service'
import { actionService } from '../../../services/actions/action_service'
import { ACTIONS_CHANGED_EVENT, ACTION_DRAFT_CHANGED_EVENT } from '../../../services/actions/action_service_events'
import * as actionServiceModule from '../../../services/actions/action_service'
import { dialogService } from '../../../services/dialog_service'
import { openFilesService } from '../../../services/open_files_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { actionMarkdownDataSource } from '../../editor/action_markdown_data_source'
import { ListActionEditor } from './list_action_editor'
import * as actionEditorControllerModule from './use_action_editor_controller'

const definition = {
    description: 'Review the selected file',
    id: 'review-action',
    label: 'Review',
    prompt: 'Review {{card-file}}',
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

function reloadAction(overrides: Record<string, unknown> = {}): ActionDefinition {
    actionService.reloadFromFiles(
        [file(overrides)],
        [{ origin: 'external', path: 'actions/review.json' }],
    )
    const action = actionService.getActionByPath('actions/review.json')
    if (!action) throw new Error('Missing reloaded test action')

    return action
}

function ActionEditorHarness(props: { action: ActionDefinition, states: string[] }) {
    const { states } = props

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <ListActionEditor
                cardTypes={['feature']}
                specialContextTypes={['actions']}
                states={states}
            />
        </Box>
    )
}

function renderEditor(action: ActionDefinition = loadAction(), states = ['ready']): RenderResult {
    openFilesService.openDocument(action)

    return render(
        <AppThemeProvider>
            <ActionEditorHarness action={action} states={states} />
        </AppThemeProvider>,
    )
}

function labelInput(): HTMLInputElement {
    return screen.getByLabelText('Label') as HTMLInputElement
}

function descriptionInput(): HTMLInputElement {
    return screen.getByLabelText('Description') as HTMLInputElement
}

describe('ActionEditor', () => {
    beforeEach(() => {
        configService.init()
        openFilesService.clear()
        openFilesService.init({ actionService, dataService })
        actionMarkdownDataSource.init(actionService)
    })

    it('waits for an active action document instead of crashing during loading', () => {
        const action = loadAction()
        render(
            <AppThemeProvider>
                <ActionEditorHarness action={action} states={['ready']} />
            </AppThemeProvider>,
        )

        expect(screen.queryByTestId('action-editor-content')).not.toBeInTheDocument()

        act(() => openFilesService.openDocument(action))

        expect(screen.getByTestId('action-editor-content')).toBeInTheDocument()
    })

    it('closes a clean action without reporting a missing open document', () => {
        const reportError = vi.spyOn(dialogService, 'error')
        renderEditor()
        const { activeDocument } = openFilesService.getSnapshot()
        if (!activeDocument) throw new Error('Missing active document')

        act(() => openFilesService.closeDocument(activeDocument))

        expect(screen.queryByTestId('action-editor-content')).not.toBeInTheDocument()
        expect(reportError).not.toHaveBeenCalled()
    })

    afterEach(() => {
        cleanup()
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
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

    it('keeps definition keystrokes local until child commit handling', () => {
        const useController = vi.spyOn(actionEditorControllerModule, 'useActionEditorController')
        renderEditor()
        const renderCount = useController.mock.calls.length

        fireEvent.change(labelInput(), { target: { value: 'Review updated' } })

        expect(labelInput()).toHaveValue('Review updated')
        expect(actionService.draftStore.getDraft('review-action').definition.label).toBe('Review updated')
        expect(useController).toHaveBeenCalledTimes(renderCount)

        fireEvent.blur(labelInput())

        expect(useController.mock.calls.length).toBeGreaterThan(renderCount)
    })

    it('keeps the section tabs outside the full-height scrolling content', () => {
        renderEditor()

        const editor = screen.getByTestId('action-editor')
        const content = screen.getByTestId('action-editor-content')
        const tabs = screen.getByRole('tablist', { name: 'Action editor sections' })

        expect(editor).toHaveStyle({ display: 'contents' })
        expect(content).toHaveStyle({ flex: '1', minHeight: '0', overflowY: 'auto' })
        expect(content.nextElementSibling).toContainElement(tabs)
        expect(content.nextElementSibling?.parentElement).toBe(editor)
    })

    it('preloads one shared Markdown editor and keeps it mounted across section tabs', () => {
        renderEditor(loadAction({ phrases: [{ text: 'Run tests', title: 'Tests' }] }))

        const preloadedEditor = screen.getByTestId('mdx-editor')
        expect(preloadedEditor.parentElement?.parentElement).toHaveAttribute('hidden')

        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        expect(screen.getByTestId('mdx-editor')).toBe(preloadedEditor)
        expect(preloadedEditor.parentElement?.parentElement).not.toHaveAttribute('hidden')

        fireEvent.click(screen.getByRole('tab', { name: 'Tests' }))
        expect(screen.getByTestId('mdx-editor')).toBe(preloadedEditor)
        expect(screen.getAllByTestId('mdx-editor')).toHaveLength(1)
    })

    it('keeps the Markdown formatting toolbar sticky', () => {
        renderEditor()

        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))

        expect(document.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()
    })

    it('restores the selected section when the editor becomes active again', () => {
        const action = loadAction({ phrases: [{ text: 'Run tests', title: 'Tests' }] })
        const view = renderEditor(action)

        fireEvent.click(screen.getByRole('tab', { name: 'Tests' }))
        expect(action.editorState?.selectedTab).toBe(action.editorState?.phrases[0].identity)
        expect(action.editorState?.selectedTab).toMatch(/^phrase-/u)

        view.unmount()
        renderEditor(action)

        expect(screen.getByRole('tab', { name: 'Tests' })).toHaveAttribute('aria-selected', 'true')
    })

    it('uses service-published editor state as its source of truth', () => {
        renderEditor(loadAction({ phrases: [{ text: 'Run tests', title: 'Tests' }] }))
        fireEvent.click(screen.getByRole('tab', { name: 'Tests' }))
        const publishedAction = actionService.getActionByPath('actions/review.json')
        const editorState = publishedAction?.editorState
        if (!editorState) throw new Error('Missing published editor state')

        act(() => actionService.setActionEditorState('review-action', {
            phrases: editorState.phrases,
            selectedTab: 'prompt',
        }))

        expect(screen.getByRole('tab', { name: 'Prompt' })).toHaveAttribute('aria-selected', 'true')
    })

    it('offers placeholders for the action prompt but not predefined phrases', () => {
        renderEditor(loadAction({ phrases: [{ text: 'Run tests', title: 'Tests' }] }))

        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        expect(screen.getByRole('button', { name: 'Insert placeholder' })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('tab', { name: 'Tests' }))
        expect(screen.queryByRole('button', { name: 'Insert placeholder' })).not.toBeInTheDocument()
    })

    it('renders persisted initial values for agent and command actions', () => {
        const agentView = renderEditor(loadAction({
            agent: 'codex',
            model: 'gpt-5',
            thinkingLevel: 'high',
        }))

        expect(screen.queryByLabelText('ID')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Label')).toHaveValue('Review')
        expect(screen.getByLabelText('Description')).toHaveValue('Review the selected file')
        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        expect(within(screen.getByTestId('mdx-editor')).getByRole('textbox')).toHaveValue('Review {{card-file}}')

        agentView.unmount()
        renderEditor(loadAction({ command: 'npm run test', prompt: undefined, type: 'command' }))

        expect(screen.getByLabelText('Command')).toHaveValue('npm run test')
        expect(screen.getByTestId('mdx-editor').parentElement?.parentElement).toHaveAttribute('hidden')
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
                <ActionEditorHarness action={action} states={['done']} />
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
        fireEvent.blur(screen.getByRole('combobox', { name: 'Run when card enters state' }))

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
        const changed = vi.fn()
        actionService.addEventListener(ACTION_DRAFT_CHANGED_EVENT, changed)

        fireEvent.change(labelInput(), { target: { value: ' \t\u2003' } })
        expect(screen.queryByText(/Missing action field label/u)).not.toBeInTheDocument()
        expect(saveDefinition).not.toHaveBeenCalled()
        expect(parse).not.toHaveBeenCalled()
        expect(serialize).not.toHaveBeenCalled()
        expect(changed).not.toHaveBeenCalled()

        fireEvent.blur(labelInput())
        expect(screen.getByText(/Missing action field label/u)).toBeInTheDocument()
        expect(changed).toHaveBeenCalledOnce()
        actionService.removeEventListener(ACTION_DRAFT_CHANGED_EVENT, changed)

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
        fireEvent.blur(labelInput())
        expect(screen.getByText('Fix validation errors to save.')).toBeInTheDocument()

        fireEvent.change(labelInput(), { target: { value: 'Review repaired' } })
        fireEvent.blur(labelInput())
        expect(screen.queryByText('Changes save automatically.')).not.toBeInTheDocument()
        await act(async () => vi.advanceTimersByTime(600))

        expect(saveDefinition).toHaveBeenCalledWith(
            'actions/review.json',
            expect.objectContaining({ label: 'Review repaired' }),
            'actions/review-repaired.json',
            expect.any(Object),
            expect.any(Function),
        )
    })

    it('auto-saves a prompt edit while the editor remains open', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition').mockResolvedValue(action)
        renderEditor(action)

        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        const changed = vi.fn()
        actionService.addEventListener(ACTION_DRAFT_CHANGED_EVENT, changed)
        const promptEditor = within(screen.getByTestId('mdx-editor')).getByRole('textbox')
        fireEvent.focus(promptEditor)
        fireEvent.change(promptEditor, {target: { value: 'Updated prompt' }})
        expect(saveDefinition).not.toHaveBeenCalled()
        expect(changed).not.toHaveBeenCalled()

        fireEvent.blur(promptEditor)
        await act(async () => vi.advanceTimersByTime(600))

        expect(saveDefinition).toHaveBeenCalledWith(
            'actions/review.json',
            expect.objectContaining({ prompt: 'Updated prompt' }),
            'actions/review.json',
            expect.any(Object),
            expect.any(Function),
        )
        actionService.removeEventListener(ACTION_DRAFT_CHANGED_EVENT, changed)
    })

    it('flushes prompt and phrase edits to their own sections when switching', () => {
        renderEditor(loadAction({ phrases: [{ text: 'Original phrase', title: 'Tests' }] }))
        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        const markdownEditor = within(screen.getByTestId('mdx-editor')).getByRole('textbox')
        fireEvent.change(markdownEditor, { target: { value: 'Edited prompt' } })

        fireEvent.click(screen.getByRole('tab', { name: 'Tests' }))

        expect(markdownEditor).toHaveValue('Original phrase')
        expect(actionService.draftStore.getDraft('review-action').definition).toMatchObject({
            phrases: [{ text: 'Original phrase', title: 'Tests' }],
            prompt: 'Edited prompt',
        })

        fireEvent.change(markdownEditor, { target: { value: 'Edited phrase' } })
        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))

        expect(markdownEditor).toHaveValue('Edited prompt')
        expect(actionService.draftStore.getDraft('review-action').definition).toMatchObject({
            phrases: [{ text: 'Edited phrase', title: 'Tests' }],
            prompt: 'Edited prompt',
        })
    })

    it('flushes a dirty prompt before loading another action prompt', () => {
        actionService.loadFromFiles([
            file(),
            {
                content: JSON.stringify({
                    description: 'Second action',
                    id: 'second-action',
                    label: 'Second',
                    prompt: 'Second prompt',
                    type: 'agent',
                }),
                path: 'actions/second.json',
            },
        ])
        const firstAction = actionService.getActionByPath('actions/review.json')
        const secondAction = actionService.getActionByPath('actions/second.json')
        if (!firstAction || !secondAction) throw new Error('Missing test actions')
        actionService.setActionEditorState('second-action', { phrases: [], selectedTab: 'prompt' })
        renderEditor(firstAction)
        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        const markdownEditor = within(screen.getByTestId('mdx-editor')).getByRole('textbox')
        fireEvent.change(markdownEditor, { target: { value: 'Edited first prompt' } })

        act(() => openFilesService.openDocument(secondAction))

        expect(markdownEditor).toHaveValue('Second prompt')
        expect(actionService.draftStore.getDraft('review-action').definition.prompt).toBe('Edited first prompt')
        expect(actionService.draftStore.getDraft('second-action').definition.prompt).toBe('Second prompt')
    })

    it('shows prompt validation on the tab and through the dialog service', async () => {
        const reportError = vi.spyOn(dialogService, 'error')
        renderEditor()

        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        const promptEditor = within(screen.getByTestId('mdx-editor')).getByRole('textbox')
        fireEvent.focus(promptEditor)
        fireEvent.change(promptEditor, { target: { value: '   ' } })
        fireEvent.blur(promptEditor)

        const promptTab = screen.getByRole('tab', { name: 'Prompt' })
        const validationError = 'Missing action field prompt in actions/review.json'
        expect(promptTab).toHaveStyle({ color: 'rgb(211, 47, 47)' })
        expect(screen.queryByText(validationError)).not.toBeInTheDocument()
        expect(screen.queryByText('Fix validation errors to save.')).not.toBeInTheDocument()
        expect(reportError).toHaveBeenCalledWith(validationError, { title: 'Invalid action' })

        fireEvent.mouseOver(within(promptTab).getByText('Prompt'))
        expect(await screen.findByRole('tooltip')).toHaveTextContent(validationError)
    })

    it('treats an unflushed prompt edit as dirty during an external reload', () => {
        const action = loadAction()
        const view = renderEditor(action)

        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        fireEvent.change(within(screen.getByTestId('mdx-editor')).getByRole('textbox'), { target: { value: 'Local prompt edit' } })

        const externalAction = reloadAction({ description: 'External description' })
        view.rerender(
            <AppThemeProvider>
                <ActionEditorHarness action={externalAction} states={['ready']} />
            </AppThemeProvider>,
        )

        expect(screen.getByText(/changed outside the editor/u)).toBeInTheDocument()
        expect(within(screen.getByTestId('mdx-editor')).getByRole('textbox')).toHaveValue('Local prompt edit')
    })

    it('replaces active prompt content when an external conflict is reloaded', () => {
        const action = loadAction()
        const view = renderEditor(action)

        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        const promptEditor = within(screen.getByTestId('mdx-editor')).getByRole('textbox')
        fireEvent.change(promptEditor, { target: { value: 'Local prompt edit' } })

        const externalAction = reloadAction({ prompt: 'External prompt edit' })
        view.rerender(
            <AppThemeProvider>
                <ActionEditorHarness action={externalAction} states={['ready']} />
            </AppThemeProvider>,
        )
        fireEvent.click(screen.getByRole('button', { name: 'Reload from disk' }))

        expect(within(screen.getByTestId('mdx-editor')).getByRole('textbox')).toHaveValue('External prompt edit')
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
        const phraseEditor = within(screen.getByTestId('mdx-editor')).getAllByRole('textbox')[1]
        fireEvent.focus(phraseEditor)
        fireEvent.change(phraseEditor, { target: { value: '**Run all tests**' } })
        fireEvent.blur(phraseEditor)
        await act(async () => vi.advanceTimersByTime(600))

        expect(screen.getByRole('tab', { name: 'Run tests' })).toBeInTheDocument()
        expect(saveDefinition).toHaveBeenLastCalledWith(
            'actions/review.json',
            expect.objectContaining({ phrases: [{ text: '**Run all tests**', title: 'Run tests' }] }),
            'actions/review.json',
            expect.any(Object),
            expect.any(Function),
        )

        fireEvent.click(screen.getByRole('button', { name: 'Delete this predefined phrase' }))
        await act(async () => vi.advanceTimersByTime(600))

        expect(screen.queryByRole('tab', { name: 'Run tests' })).not.toBeInTheDocument()
        expect(saveDefinition).toHaveBeenLastCalledWith(
            'actions/review.json',
            expect.objectContaining({ phrases: [] }),
            'actions/review.json',
            expect.any(Object),
            expect.any(Function),
        )
    })

    it('discards an unflushed phrase buffer when deleting that phrase', () => {
        const action = loadAction({ phrases: [{ text: 'Original text', title: 'Temporary' }] })
        renderEditor(action)
        fireEvent.click(screen.getByRole('tab', { name: 'Temporary' }))
        const phraseEditor = within(screen.getByTestId('mdx-editor')).getAllByRole('textbox')[1]
        fireEvent.change(phraseEditor, { target: { value: 'Unflushed text' } })

        fireEvent.click(screen.getByRole('button', { name: 'Delete this predefined phrase' }))

        expect(screen.getByRole('tab', { name: 'Prompt' })).toHaveAttribute('aria-selected', 'true')
        expect(actionService.draftStore.getDraft('review-action').definition.phrases).toEqual([])
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

        const externalAction = reloadAction({ phrases: [] })
        view.rerender(
            <AppThemeProvider>
                <ActionEditorHarness action={externalAction} states={['ready']} />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('tab', { name: 'Prompt' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.queryByRole('tab', { name: 'Tests' })).not.toBeInTheDocument()
    })

    it.each([
        ['first', 'Alpha'],
        ['middle', 'Beta'],
        ['last', 'Gamma'],
    ])('deletes the %s phrase without changing remaining identities', (_position, title) => {
        const phrases = [
            { text: 'Alpha text', title: 'Alpha' },
            { text: 'Beta text', title: 'Beta' },
            { text: 'Gamma text', title: 'Gamma' },
        ]
        const action = loadAction({ phrases })
        renderEditor(action)
        const previousIdentities = new Map(action.editorState?.phrases.map((entry) => [entry.phrase.title, entry.identity]))

        fireEvent.click(screen.getByRole('tab', { name: title }))
        fireEvent.click(screen.getByRole('button', { name: 'Delete this predefined phrase' }))

        expect(screen.getByRole('tab', { name: 'Prompt' })).toHaveAttribute('aria-selected', 'true')
        expect(action.editorState?.phrases.map(({ phrase }) => phrase.title)).toEqual(
            phrases.filter((phrase) => phrase.title !== title).map(({ title: phraseTitle }) => phraseTitle),
        )
        for (const entry of action.editorState?.phrases ?? []) {
            expect(entry.identity).toBe(previousIdentities.get(entry.phrase.title))
        }
    })

    it('keeps selected phrase identity when an external reload deletes an earlier phrase and reorders survivors', () => {
        const initialPhrases = [
            { text: 'Alpha text', title: 'Alpha' },
            { text: 'Beta text', title: 'Beta' },
            { text: 'Gamma text', title: 'Gamma' },
        ]
        const action = loadAction({ phrases: initialPhrases })
        const view = renderEditor(action)
        fireEvent.click(screen.getByRole('tab', { name: 'Beta' }))
        const selectedIdentity = action.editorState?.selectedTab
        const gammaIdentity = action.editorState?.phrases[2].identity
        const externalAction = reloadAction({ phrases: [initialPhrases[2], initialPhrases[1]] })

        view.rerender(
            <AppThemeProvider>
                <ActionEditorHarness action={externalAction} states={['ready']} />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true')
        expect(externalAction.editorState?.selectedTab).toBe(selectedIdentity)
        expect(externalAction.editorState?.phrases.map(({ identity }) => identity)).toEqual([gammaIdentity, selectedIdentity])
    })

    it('assigns a new identity when adding after deletion', () => {
        const action = loadAction({ phrases: [{ text: 'Alpha text', title: 'Alpha' }, { text: 'Beta text', title: 'Beta' }] })
        renderEditor(action)
        fireEvent.click(screen.getByRole('tab', { name: 'Alpha' }))
        const deletedIdentity = action.editorState?.selectedTab
        const betaIdentity = action.editorState?.phrases[1].identity
        fireEvent.click(screen.getByRole('button', { name: 'Delete this predefined phrase' }))

        fireEvent.click(screen.getByRole('tab', { name: 'Add predefined phrase' }))

        expect(action.editorState?.phrases[0].identity).toBe(betaIdentity)
        expect(action.editorState?.phrases[1].identity).not.toBe(deletedIdentity)
        expect(action.editorState?.selectedTab).toBe(action.editorState?.phrases[1].identity)
    })

    it('does not validate or save while a newly added filter value is empty', async () => {
        vi.useFakeTimers()
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition')
        const reportError = vi.spyOn(dialogService, 'error')
        renderEditor()

        fireEvent.click(screen.getByRole('button', { name: 'Add filter' }))

        await act(async () => vi.advanceTimersByTime(600))
        expect(actionService.draftStore.getDraft('review-action').validation.valid).toBe(true)
        expect(actionService.draftStore.getDraft('review-action').definition.appliesTo).toBeUndefined()
        expect(reportError).not.toHaveBeenCalled()
        expect(saveDefinition).not.toHaveBeenCalled()
    })

    it('publishes a newly added filter after its value is selected', () => {
        renderEditor()

        fireEvent.click(screen.getByRole('button', { name: 'Add filter' }))
        fireEvent.mouseDown(screen.getByLabelText('Target kind'))
        fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'card' }))

        expect(actionService.draftStore.getDraft('review-action').definition.appliesTo).toEqual({ kind: 'card' })
        expect(screen.getByRole('combobox', { name: 'Target kind' })).toHaveTextContent('card')
    })

    it('reports definition-level errors with no routable field without an inline alert', () => {
        const reportError = vi.spyOn(dialogService, 'error')
        const action = loadAction()
        const invalidDefinition = { ...definition, unexpected: undefined } as RawActionDefinition
        actionService.draftStore.updateDraft('review-action', invalidDefinition)
        renderEditor(action)

        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(reportError).toHaveBeenCalledWith('Unknown action field unexpected in actions/review.json', { title: 'Invalid action' })
    })

    it('auto-saves valid structured changes', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition').mockResolvedValue(action)
        renderEditor(action)

        fireEvent.change(labelInput(), { target: { value: 'Review code' } })
        fireEvent.blur(labelInput())
        await act(async () => vi.advanceTimersByTime(600))

        expect(saveDefinition).toHaveBeenCalledWith(
            'actions/review.json',
            expect.objectContaining({ id: 'review-action', label: 'Review code' }),
            'actions/review-code.json',
            expect.any(Object),
            expect.any(Function),
        )
    })

    it('does not render saving state inside the action editor', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        const pendingSave = deferred<ActionDefinition>()
        vi.spyOn(actionService, 'saveDefinition').mockReturnValue(pendingSave.promise)
        renderEditor(action)

        fireEvent.change(labelInput(), { target: { value: 'Review code' } })
        await act(async () => vi.advanceTimersByTime(600))

        expect(screen.queryByText('Saving…')).not.toBeInTheDocument()
        await act(async () => pendingSave.resolve(action))
    })

    it('persists and publishes an edit through the real action service', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        const persistActionFile = vi.spyOn(dataService, 'persistActionFile').mockResolvedValue(undefined)
        const changed = vi.fn()
        actionService.addEventListener(ACTIONS_CHANGED_EVENT, changed)
        renderEditor(action)

        fireEvent.change(labelInput(), { target: { value: 'Published label' } })
        fireEvent.blur(labelInput())
        await act(async () => vi.advanceTimersByTime(600))

        expect(persistActionFile).toHaveBeenCalledWith(
            {
                content: expect.stringContaining('"label": "Published label"'),
                path: 'actions/published-label.json',
            },
            'review-action',
            'actions/review.json',
            expect.any(Function),
            expect.any(Object),
            expect.any(Function),
        )
        expect(actionService.getActionByPath('actions/review.json')?.label).toBe('Published label')
        expect(changed).toHaveBeenCalled()
        actionService.removeEventListener(ACTIONS_CHANGED_EVENT, changed)
    })

    it('shows save failure status and retries the newest draft', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        const saveDefinition = vi.spyOn(actionService, 'saveDefinition')
            .mockRejectedValueOnce(new Error('disk unavailable'))
            .mockResolvedValueOnce(action)
        renderEditor(action)

        fireEvent.change(labelInput(), { target: { value: 'Retry this value' } })
        fireEvent.blur(labelInput())
        await act(async () => vi.advanceTimersByTime(600))

        expect(screen.getByRole('alert')).toHaveTextContent('disk unavailable')
        expect(screen.getByText('Save failed. Retry to save changes.')).toBeInTheDocument()

        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry save' })))

        expect(saveDefinition).toHaveBeenCalledTimes(2)
        expect(saveDefinition).toHaveBeenLastCalledWith(
            'actions/review.json',
            expect.objectContaining({ label: 'Retry this value' }),
            'actions/retry-this-value.json',
            expect.any(Object),
            expect.any(Function),
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
        fireEvent.blur(labelInput())
        await act(async () => vi.advanceTimersByTime(600))
        expect(saveDefinition).toHaveBeenCalledTimes(1)

        // Type again while the first save is still in flight.
        fireEvent.change(labelInput(), { target: { value: 'Review code 2' } })
        // Completing the first (stale) save must not revert the newer draft.
        await act(async () => saves[0].resolve(action))
        expect(labelInput().value).toBe('Review code 2')

        fireEvent.blur(labelInput())
        await act(async () => vi.advanceTimersByTime(600))
        expect(saveDefinition).toHaveBeenLastCalledWith(
            'actions/review.json',
            expect.objectContaining({ label: 'Review code 2' }),
            'actions/review-code-2.json',
            expect.any(Object),
            expect.any(Function),
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
        fireEvent.blur(labelInput())
        await act(async () => vi.advanceTimersByTime(600))

        // Queue a newer save behind the first one, then fail the first one.
        fireEvent.change(labelInput(), { target: { value: 'Review code 2' } })
        fireEvent.blur(labelInput())
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
            'actions/review-code.json',
            expect.any(Object),
            expect.any(Function),
        )
    })

    it('shows a conflict and requires explicit resolution on external change while dirty', () => {
        vi.spyOn(actionService, 'saveDefinition').mockReturnValue(deferred<ActionDefinition>().promise)
        const action = loadAction()
        const view = renderEditor(action)

        fireEvent.change(labelInput(), { target: { value: 'Local edit' } })

        // An external change arrives while the draft is dirty.
        const externalAction = reloadAction({ description: 'External change' })
        view.rerender(
            <AppThemeProvider>
                <ActionEditorHarness action={externalAction} states={['ready']} />
            </AppThemeProvider>,
        )

        expect(screen.getByText(/changed outside the editor/u)).toBeInTheDocument()
        expect(labelInput().value).toBe('Local edit')

        fireEvent.click(screen.getByRole('button', { name: 'Reload from disk' }))

        expect(screen.queryByText(/changed outside the editor/u)).not.toBeInTheDocument()
        expect(labelInput().value).toBe('Review')
        expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('External change')
    })

    it('treats an external change matching an older local snapshot as a conflict', async () => {
        vi.useFakeTimers()
        const action = loadAction()
        vi.spyOn(actionService, 'saveDefinition').mockReturnValue(deferred<ActionDefinition>().promise)
        const view = renderEditor(action)

        fireEvent.change(descriptionInput(), { target: { value: 'First local edit' } })
        await act(async () => vi.advanceTimersByTime(500))
        fireEvent.change(descriptionInput(), { target: { value: 'Newer local edit' } })

        const olderLocalSnapshot = reloadAction({ description: 'First local edit', phrases: [] })
        view.rerender(
            <AppThemeProvider>
                <ActionEditorHarness action={olderLocalSnapshot} states={['ready']} />
            </AppThemeProvider>,
        )

        expect(screen.getByText(/changed outside the editor/u)).toBeInTheDocument()
        expect(descriptionInput()).toHaveValue('Newer local edit')
    })

    it('adopts an external reload immediately while the draft is clean', () => {
        const action = loadAction()
        const view = renderEditor(action)
        const externalAction = reloadAction({ label: 'External label' })

        view.rerender(
            <AppThemeProvider>
                <ActionEditorHarness action={externalAction} states={['ready']} />
            </AppThemeProvider>,
        )

        expect(labelInput()).toHaveValue('External label')
        expect(screen.queryByText(/changed outside the editor/u)).not.toBeInTheDocument()
    })

    it('treats property-order-only external reloads as clean structured state', () => {
        const action = loadAction()
        const view = renderEditor(action)
        fireEvent.change(labelInput(), { target: { value: 'Local edit' } })
        const reorderedFile = {
            content: JSON.stringify({
                type: 'agent',
                prompt: definition.prompt,
                label: definition.label,
                id: definition.id,
                description: definition.description,
            }),
            path: 'actions/review.json',
        }
        actionService.reloadFromFiles(
            [reorderedFile],
            [{ origin: 'external', path: 'actions/review.json' }],
        )
        const reloadedAction = actionService.getActionByPath('actions/review.json')
        if (!reloadedAction) throw new Error('Missing reloaded action')

        view.rerender(
            <AppThemeProvider>
                <ActionEditorHarness action={reloadedAction} states={['ready']} />
            </AppThemeProvider>,
        )

        expect(screen.queryByText(/changed outside the editor/u)).not.toBeInTheDocument()
        expect(labelInput().value).toBe('Local edit')
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
