import { act, cleanup, renderHook } from '@testing-library/react'
import type { SyntheticEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../../data/action_types'
import { actionService } from '../../../services/actions/action_service'
import { dataService } from '../../../services/data/data_service'
import { openFilesService } from '../../../services/open_files_service'
import { useActionEditorController } from './use_action_editor_controller'

function loadAction(): ActionDefinition {
    actionService.loadFromFiles([{
        content: JSON.stringify({
            description: 'Review the selected file',
            id: 'review-action',
            label: 'Review',
            phrases: [{ text: 'Run tests', title: 'Tests' }],
            prompt: 'Review it',
            type: 'agent',
        }),
        path: 'actions/review.json',
    }, {
        content: JSON.stringify({description: 'Other action', id: 'other-action', label: 'Other', prompt: 'Other prompt', type: 'agent'}),
        path: 'actions/other.json',
    }])
    const action = actionService.getActionByPath('actions/review.json')
    if (!action) throw new Error('Missing test action')

    return action
}

describe('useActionEditorController', () => {
    afterEach(() => {
        cleanup()
        actionService.clear()
        vi.restoreAllMocks()
    })

    it('owns prompt and phrase sections on one canonical action document', () => {
        vi.spyOn(dataService, 'persistActionFile').mockResolvedValue(undefined)
        const action = loadAction()
        openFilesService.init({ actionService, dataService })
        const document = openFilesService.openDocument(action)
        if (document.kind !== 'action') throw new Error('Expected action document')
        const discardMarkdownTarget = vi.fn()
        const { result } = renderHook(() => useActionEditorController({
            action,
            actions: actionService.getActions(),
            discardMarkdownTarget,
            openDocument: document,
            sourcePath: 'actions/review.json',
        }))

        expect(result.current.markdownTarget).toEqual({ document, section: { kind: 'prompt' } })

        const phraseIdentity = action.editorState?.phrases[0].identity
        if (!phraseIdentity) throw new Error('Missing phrase editor identity')
        act(() => result.current.handleTabChange({} as SyntheticEvent, phraseIdentity))
        const phraseTarget = result.current.markdownTarget
        act(() => result.current.handleDeletePhrase())
        expect(discardMarkdownTarget).toHaveBeenCalledWith(phraseTarget)
        expect(actionService.draftStore.getDraft('actions/review.json').definition.phrases).toEqual([])
    })

    it('does not rerender for an unrelated action editor-state event', () => {
        const action = loadAction()
        openFilesService.init({ actionService, dataService })
        const document = openFilesService.openDocument(action)
        if (document.kind !== 'action') throw new Error('Expected action document')
        let renderCount = 0
        renderHook(() => {
            renderCount += 1
            return useActionEditorController({
                action,
                actions: actionService.getActions(),
                discardMarkdownTarget: vi.fn(),
                openDocument: document,
                sourcePath: 'actions/review.json',
            })
        })
        const initialRenderCount = renderCount

        act(() => actionService.setActionEditorState('actions/other.json', { phrases: [], selectedTab: 'prompt' }))

        expect(renderCount).toBe(initialRenderCount)
    })
})
