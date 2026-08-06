import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Card } from '../../data/data_types'
import { openFilesService } from '../../services/open_files_service'
import { useActiveDocumentPath, useIsActiveDocument } from './use_active_document'

function Card(path: string): Card {
    return {
        agentConversationErrors: [], agentConversations: [], content: '', hasFrontmatter: true, isActive: true, path,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: path, internalId: path,
            owner: null, policy: {}, status: null, title: path,
        },
    }
}

describe('active document hooks', () => {
    afterEach(() => {
        cleanup()
        openFilesService.clear()
    })

    it('returns the active document path', () => {
        const card = Card('design/F-1.md')
        const { result } = renderHook(() => useActiveDocumentPath())

        act(() => openFilesService.openDocument(card))

        expect(result.current).toBe(card.path)
    })

    it('does not rerender when another path remains inactive', () => {
        const firstCard = Card('design/F-1.md')
        const secondCard = Card('design/F-2.md')
        let renderCount = 0
        const { result } = renderHook(() => {
            renderCount += 1

            return useIsActiveDocument('design/unrelated.md')
        })

        act(() => openFilesService.openDocument(firstCard))
        act(() => openFilesService.openDocument(secondCard))

        expect(result.current).toBe(false)
        expect(renderCount).toBe(1)
    })
})
