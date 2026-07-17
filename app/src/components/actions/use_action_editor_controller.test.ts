import { act, cleanup, renderHook } from '@testing-library/react'
import type { SyntheticEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../data/action_types'
import { actionService } from '../../services/action_service'
import { dataService } from '../../services/data_service'
import { actionMarkdownDocumentId, useActionEditorController } from './use_action_editor_controller'

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

        expect(result.current.markdownDocumentId).toBe(actionMarkdownDocumentId('test-project', 'actions/review.json', 'prompt'))
        expect(result.current.markdownDocumentIds).toHaveLength(2)
        expect(actionMarkdownDocumentId('other-project', 'actions/review.json', 'prompt')).not.toBe(result.current.markdownDocumentId)

        const phraseIdentity = action.editorState?.phrases[0].identity
        if (!phraseIdentity) throw new Error('Missing phrase editor identity')
        act(() => result.current.handleTabChange({} as SyntheticEvent, phraseIdentity))
        expect(result.current.markdown).toBe('Run tests')

        act(() => result.current.handleMarkdownChange('Run focused tests'))
        expect(actionService.getDraft('actions/review.json').definition.phrases?.[0].text).toBe('Run focused tests')

        const phraseDocumentId = result.current.markdownDocumentId
        act(() => result.current.handleDeletePhrase())
        expect(discardMarkdownDocument).toHaveBeenCalledWith(phraseDocumentId, 'Run focused tests')
        expect(actionService.getDraft('actions/review.json').definition.phrases).toEqual([])
    })
})
