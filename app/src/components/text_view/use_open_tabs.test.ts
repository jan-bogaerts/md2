import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { openFilesService } from '../../services/open_files_service'
import { useOpenTabs } from './use_open_tabs'

describe('useOpenTabs', () => {
    beforeEach(() => {
        openFilesService.clear()
    })

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

    it('closes tabs whose files are no longer available', () => {
        const { rerender, result } = renderHook(({ paths }) => useOpenTabs(paths), {initialProps: { paths: ['a.md', 'b.md'] }})

        act(() => result.current.openTab('a.md'))
        act(() => result.current.openTab('b.md'))
        rerender({ paths: ['b.md'] })

        expect(result.current.tabs).toEqual(['b.md'])
        expect(result.current.activePath).toBe('b.md')
    })

    it('restores open tabs after the hook unmounts and mounts again', () => {
        const first = renderHook(() => useOpenTabs())
        act(() => first.result.current.openTab('a.md'))
        act(() => first.result.current.openTab('b.md'))
        first.unmount()

        const second = renderHook(() => useOpenTabs())

        expect(second.result.current.tabs).toEqual(['a.md', 'b.md'])
        expect(second.result.current.activePath).toBe('b.md')
    })
})
