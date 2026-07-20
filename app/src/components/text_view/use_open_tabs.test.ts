import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ProjectCard } from '../../data/data_types'
import { OpenFilesService } from '../../services/open_files_service'
import { useOpenTabs } from './use_open_tabs'

function card(internalId: string): ProjectCard {
    return {
        agentConversationErrors: [], agentConversations: [], content: internalId,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: internalId, internalId,
            owner: null, policy: {}, status: null, title: internalId,
        },
        headerFields: {}, isActive: true, path: `${internalId}.md`,
    }
}

describe('useOpenTabs', () => {
    it('opens domain objects and reactivates their stable wrapper', () => {
        const service = new OpenFilesService()
        const firstCard = card('one')
        const secondCard = card('two')
        const { result } = renderHook(() => useOpenTabs(service))

        act(() => result.current.openTab(firstCard))
        const firstDocument = result.current.activeDocument
        act(() => result.current.openTab(secondCard))
        act(() => result.current.openTab(firstCard))

        expect(result.current.tabs).toHaveLength(2)
        expect(result.current.activeDocument).toBe(firstDocument)
    })

    it('focuses neighboring wrapper when active tab closes', () => {
        const service = new OpenFilesService()
        const { result } = renderHook(() => useOpenTabs(service))
        act(() => result.current.openTab(card('one')))
        act(() => result.current.openTab(card('two')))
        const secondDocument = result.current.activeDocument
        act(() => result.current.openTab(card('three')))

        act(() => {
            if (!secondDocument) throw new Error('Missing second document')
            result.current.activateTab(secondDocument)
            result.current.closeTab(secondDocument)
        })

        expect(result.current.tabs).toHaveLength(2)
        expect((result.current.activeDocument?.getObject() as ProjectCard).header.internalId).toBe('three')
    })

    it('preserves wrapper snapshot across hook remount', () => {
        const service = new OpenFilesService()
        const first = renderHook(() => useOpenTabs(service))
        act(() => first.result.current.openTab(card('one')))
        const document = first.result.current.activeDocument
        first.unmount()

        const second = renderHook(() => useOpenTabs(service))

        expect(second.result.current.activeDocument).toBe(document)
    })
})
