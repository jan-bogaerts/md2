import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Card } from '../../data/data_types'
import { openFilesService } from '../../services/open_files_service'
import { useOpenFiles } from './use_open_files'

const card: Card = {
    agentConversationErrors: [], agentConversations: [], content: '', hasFrontmatter: true, isActive: true, path: 'design/card.md',
    header: {
        affects: [], after: null, agentLogReferences: [], author: null, id: 'F-1', internalId: 'card-1',
        owner: null, policy: {}, references: [], status: null, title: 'Card',
    },
}

describe('useOpenFiles', () => {
    afterEach(() => {
        cleanup()
        openFilesService.clear()
    })

    it('reflects service-owned open documents and active selection', () => {
        const { result } = renderHook(() => useOpenFiles())

        act(() => openFilesService.openDocument(card))

        expect(result.current.documents).toHaveLength(1)
        expect(result.current.activeDocument?.getObject()).toBe(card)
    })
})
