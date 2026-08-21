import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Box } from '@mui/material'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../../data/action_types'
import { actionService } from '../../../services/actions/action_service'
import { configService } from '../../../services/config/config_service'
import { dataService } from '../../../services/data/data_service'
import { openFilesService } from '../../../services/open_files_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { actionMarkdownDataSource } from '../../editor/action_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../../editor/markdown_document_history_store'
import { ListActionEditor } from './list_action_editor'

const PROMPT = 'Review every line.\n\nUse **context** from {{card-file}} and {{card-content}}.'

function loadAction(): ActionDefinition {
    actionService.loadFromFiles([{
        content: JSON.stringify({
            description: 'Review selected card',
            id: 'review-action',
            label: 'Review',
            phrases: [{ text: 'Run related tests', title: 'Tests' }],
            prompt: PROMPT,
            type: 'agent',
        }),
        path: 'actions/review.json',
    }])
    const action = actionService.getActionByPath('actions/review.json')
    if (!action) throw new Error('Missing test action')

    return action
}

function renderEditor(action: ActionDefinition) {
    openFilesService.openDocument(action)

    return render(
        <AppThemeProvider>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <ListActionEditor cardTypes={['feature']} specialContextTypes={['actions']} states={['ready']} />
            </Box>
        </AppThemeProvider>,
    )
}

function editorText() {
    return document.querySelector('[contenteditable="true"]')?.textContent ?? ''
}

describe('ActionEditor with installed MDXEditor', () => {
    beforeEach(() => {
        configService.init()
        openFilesService.clear()
        openFilesService.init({ actionService, dataService })
        actionMarkdownDataSource.init(actionService)
    })

    afterEach(() => {
        cleanup()
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
        actionService.clear()
        configService.clear()
        vi.restoreAllMocks()
    })

    it('loads prompt selected immediately after opening', async () => {
        renderEditor(loadAction())

        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))

        await waitFor(() => expect(editorText()).toContain('Review every line.'))
        expect(editorText()).toContain('{{card-file}}')
        expect(editorText()).toContain('{{card-content}}')
    })

    it('loads prompt selected after editor initialization', async () => {
        renderEditor(loadAction())
        await waitFor(() => expect(document.querySelector('[contenteditable="true"]')).not.toBeNull())

        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))

        await waitFor(() => expect(editorText()).toContain('Review every line.'))
    })

    it('loads persisted Prompt selected before history attachment', async () => {
        const lifecycle: string[] = []
        const action = loadAction()
        actionService.setActionEditorState('actions/review.json', {
            phrases: action.editorState?.phrases ?? [],
            selectedTab: 'prompt',
        })
        EventTarget.prototype.addEventListener.call(actionMarkdownDataSource, 'activeDocumentChanged', () => {
            lifecycle.push('target-changed')
        })
        const addEventListener = actionMarkdownDataSource.addEventListener.bind(actionMarkdownDataSource)
        vi.spyOn(actionMarkdownDataSource, 'addEventListener').mockImplementation((type, listener, options) => {
            if (type === 'activeDocumentChanged') lifecycle.push('monitor-subscribed')
            addEventListener(type, listener, options)
        })
        const attachEditor = MarkdownDocumentHistoryStore.prototype.attachEditor
        vi.spyOn(MarkdownDocumentHistoryStore.prototype, 'attachEditor').mockImplementation(function (...args) {
            lifecycle.push(args[1] ? 'store-attached-current' : 'store-attached-initial')
            attachEditor.apply(this, args)
        })

        renderEditor(action)

        await waitFor(() => expect(lifecycle).toContain('monitor-subscribed'))
        expect(lifecycle.indexOf('target-changed')).toBeLessThan(lifecycle.indexOf('store-attached-initial'))
        expect(lifecycle.indexOf('store-attached-initial')).toBeLessThan(lifecycle.indexOf('monitor-subscribed'))
        expect(lifecycle).not.toContain('store-attached-current')
        await waitFor(() => expect(editorText()).toContain('Review every line.'))
    })
})
