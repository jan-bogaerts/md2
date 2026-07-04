import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useOpenTabs } from './use_open_tabs'

describe('useOpenTabs', () => {
    it('opens a file as a new active tab', () => {
        const { result } = renderHook(() => useOpenTabs())

        act(() => result.current.openTab('a.md'))

        expect(result.current.tabs).toEqual(['a.md'])
        expect(result.current.activePath).toBe('a.md')
    })

    it('activates the existing tab instead of duplicating on reopen', () => {
        const { result } = renderHook(() => useOpenTabs())

        act(() => result.current.openTab('a.md'))
        act(() => result.current.openTab('b.md'))
        act(() => result.current.openTab('a.md'))

        expect(result.current.tabs).toEqual(['a.md', 'b.md'])
        expect(result.current.activePath).toBe('a.md')
    })

    it('activates an already-open tab', () => {
        const { result } = renderHook(() => useOpenTabs())

        act(() => result.current.openTab('a.md'))
        act(() => result.current.openTab('b.md'))
        act(() => result.current.activateTab('a.md'))

        expect(result.current.activePath).toBe('a.md')
    })

    it('ignores activation of a tab that is not open', () => {
        const { result } = renderHook(() => useOpenTabs())

        act(() => result.current.openTab('a.md'))
        act(() => result.current.activateTab('missing.md'))

        expect(result.current.activePath).toBe('a.md')
    })

    it('focuses the following tab when the active tab is closed', () => {
        const { result } = renderHook(() => useOpenTabs())

        act(() => result.current.openTab('a.md'))
        act(() => result.current.openTab('b.md'))
        act(() => result.current.openTab('c.md'))
        act(() => result.current.activateTab('b.md'))
        act(() => result.current.closeTab('b.md'))

        expect(result.current.tabs).toEqual(['a.md', 'c.md'])
        expect(result.current.activePath).toBe('c.md')
    })

    it('focuses the previous tab when the last tab is closed', () => {
        const { result } = renderHook(() => useOpenTabs())

        act(() => result.current.openTab('a.md'))
        act(() => result.current.openTab('b.md'))
        act(() => result.current.closeTab('b.md'))

        expect(result.current.activePath).toBe('a.md')
    })

    it('clears the active path when the only tab is closed', () => {
        const { result } = renderHook(() => useOpenTabs())

        act(() => result.current.openTab('a.md'))
        act(() => result.current.closeTab('a.md'))

        expect(result.current.tabs).toEqual([])
        expect(result.current.activePath).toBeNull()
    })

    it('keeps the active tab when closing a different tab', () => {
        const { result } = renderHook(() => useOpenTabs())

        act(() => result.current.openTab('a.md'))
        act(() => result.current.openTab('b.md'))
        act(() => result.current.activateTab('a.md'))
        act(() => result.current.closeTab('b.md'))

        expect(result.current.activePath).toBe('a.md')
    })
})
