import { act, cleanup, renderHook } from '@testing-library/react'
import type { SyntheticEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../data/action_types'
import { actionService } from '../../services/actions/action_service'
import { dataService } from '../../services/data/data_service'
import { actionMarkdownDocumentId } from '../editor/action_markdown_data_source'
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

    it('owns namespaced prompt and phrase document lifecycle outside ActionEditor rendering', () => {
        vi.spyOn(dataService, 'persistActionFile').mockResolvedValue(undefined)
        const action = loadAction()
        const discardMarkdownDocument = vi.fn()
        const { result } = renderHook(() => useActionEditorController({
            action,
            actions: actionService.getActions(),
            discardMarkdownDocument,
            markdownDocumentNamespace: 'test-project',
        }))

        expect(result.current.markdownDocumentId).toBe(actionMarkdownDocumentId('test-project', 'review-action', 'prompt'))
        expect(actionMarkdownDocumentId('other-project', 'review-action', 'prompt')).not.toBe(result.current.markdownDocumentId)

        const phraseIdentity = action.editorState?.phrases[0].identity
        if (!phraseIdentity) throw new Error('Missing phrase editor identity')
        act(() => result.current.handleTabChange({} as SyntheticEvent, phraseIdentity))
        const phraseDocumentId = result.current.markdownDocumentId
        act(() => result.current.handleDeletePhrase())
        expect(discardMarkdownDocument).toHaveBeenCalledWith(phraseDocumentId)
        expect(actionService.getDraft('actions/review.json').definition.phrases).toEqual([])
    })

    it('does not rerender for an unrelated action editor-state event', () => {
        const action = loadAction()
        let renderCount = 0
        renderHook(() => {
            renderCount += 1
            return useActionEditorController({
                action,
                actions: actionService.getActions(),
                discardMarkdownDocument: vi.fn(),
                markdownDocumentNamespace: 'test-project',
            })
        })
        const initialRenderCount = renderCount

        act(() => actionService.setActionEditorState('actions/other.json', { phrases: [], selectedTab: 'prompt' }))

        expect(renderCount).toBe(initialRenderCount)
    })
})
