import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ActionFile } from '../../data/action_types'
import { ActionService } from '../../services/actions/action_service'
import { useActionFileTreeActions } from './use_action_file_tree_actions'

function file(definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: 'actions/action.json' }
}

describe('useActionFileTreeActions', () => {
    it('updates only when a file-tree action field changes', () => {
        const service = new ActionService()
        service.loadFromFiles([file({ command: 'run', description: 'First', id: 'do', label: 'Do', type: 'command' })])
        const { result } = renderHook(() => useActionFileTreeActions(service))
        const initialSnapshot = result.current

        act(() => {
            service.loadFromFiles([file({ command: 'run', description: 'Second', id: 'do', label: 'Do', type: 'command' })])
        })
        expect(result.current).toBe(initialSnapshot)

        act(() => {
            service.loadFromFiles([file({ command: 'run', description: 'Second', id: 'do', label: 'Do more', type: 'command' })])
        })
        expect(result.current).not.toBe(initialSnapshot)
        expect(result.current).toEqual(expect.arrayContaining([
            expect.objectContaining({ label: 'Do more', sourcePath: 'actions/action.json' }),
        ]))
    })
})
