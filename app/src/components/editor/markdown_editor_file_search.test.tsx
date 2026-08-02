import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import type { DataServiceState } from '../../services/data/data_service'
import { AppThemeProvider } from '../../theme/theme_provider'

const testState = vi.hoisted<{ current: DataServiceState }>(() => ({current: { project: null, runningAgents: [], snapshot: null }}))
const markdownFileSearchPlugin = vi.hoisted(() => vi.fn(() => ({})))

vi.mock('../hooks/use_project_state', () => ({useProjectState: () => testState.current}))
vi.mock('./markdown_file_search_realm_plugin', () => ({ markdownFileSearchPlugin }))

import { MarkdownEditor } from './markdown_editor'

function renderFileSearchEditor(hideToolbar = false) {
    return render(
        <AppThemeProvider>
            <MarkdownEditor
                hideToolbar={hideToolbar}
                markdown=""
                onChange={vi.fn()}
                placeholders={ACTION_PROMPT_PLACEHOLDERS}
            />
        </AppThemeProvider>,
    )
}

describe('MarkdownEditor file search', () => {
    afterEach(() => {
        cleanup()
        markdownFileSearchPlugin.mockClear()
        testState.current = { project: null, runningAgents: [], snapshot: null }
    })

    it('configures no file options while no project is loaded', () => {
        renderFileSearchEditor()

        expect(markdownFileSearchPlugin).toHaveBeenLastCalledWith({
            overlayContainer: undefined,
            repositoryFiles: [],
        })
    })

    it('updates file options when project state changes', () => {
        const { rerender } = renderFileSearchEditor()
        const repositoryFiles = ['app/readme.md', 'desktop/readme.md']
        testState.current = {
            project: { branch: 'main', id: 'project' },
            runningAgents: [],
            snapshot: { activeCards: [], backgroundCards: [], repositoryFiles, workingFolder: 'design' },
        }

        rerender(
            <AppThemeProvider>
                <MarkdownEditor markdown="" onChange={vi.fn()} placeholders={ACTION_PROMPT_PLACEHOLDERS} />
            </AppThemeProvider>,
        )

        expect(markdownFileSearchPlugin).toHaveBeenLastCalledWith({
            overlayContainer: undefined,
            repositoryFiles,
        })
    })

    it('installs file search in toolbarless editors', () => {
        testState.current = {
            project: { branch: 'main', id: 'project' },
            runningAgents: [],
            snapshot: {
                activeCards: [],
                backgroundCards: [],
                repositoryFiles: ['design/F_108.md'],
                workingFolder: 'design',
            },
        }

        renderFileSearchEditor(true)

        expect(screen.queryByTestId('mdx-editor-toolbar')).not.toBeInTheDocument()
        expect(markdownFileSearchPlugin).toHaveBeenCalledOnce()
    })

    it('keeps placeholder controls while file search is installed', () => {
        renderFileSearchEditor()

        expect(screen.getByRole('button', { name: 'Insert placeholder' })).toBeInTheDocument()
        expect(markdownFileSearchPlugin).toHaveBeenCalledOnce()
    })
})
