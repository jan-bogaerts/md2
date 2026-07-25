import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useActions } from './use_actions'
import { ActionService } from '../../services/actions/action_service'
import { CUSTOM_PROMPT_ACTION_ID, REMARKABLE_CONVERT_ACTION_ID, type ActionFile } from '../../data/action_types'

function file(definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: 'actions/action.json' }
}

describe('useActions', () => {
    it('returns the current actions and updates when they load', () => {
        const service = new ActionService()
        const { result } = renderHook(() => useActions(service))

        expect(result.current.actions.map((action) => action.id)).toEqual([
            CUSTOM_PROMPT_ACTION_ID, REMARKABLE_CONVERT_ACTION_ID,
        ])

        act(() => {
            service.loadFromFiles([file({ command: 'run', description: 'Do', id: 'do', label: 'Do', type: 'command' })])
        })

        expect(result.current.actions.map((action) => action.id)).toContain('do')
    })

    it('keeps the public snapshot stable for draft-only changes', () => {
        const service = new ActionService()
        service.loadFromFiles([file({ command: 'run', description: 'Do', id: 'do', label: 'Do', type: 'command' })])
        const { result } = renderHook(() => useActions(service))
        const initialSnapshot = result.current

        act(() => {
            service.setActionEditorState('actions/action.json', { phrases: [], selectedTab: 'settings' })
        })

        expect(result.current).toBe(initialSnapshot)
    })
})
