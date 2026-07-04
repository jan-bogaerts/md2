import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { THEME_MODE_STORAGE_KEY, useThemeMode } from './use_theme_mode'

describe('useThemeMode', () => {
    afterEach(() => {
        window.localStorage.clear()
    })

    it('defaults to light when no preference is stored', () => {
        const { result } = renderHook(() => useThemeMode())

        expect(result.current.mode).toBe('light')
    })

    it('restores the persisted mode', () => {
        window.localStorage.setItem(THEME_MODE_STORAGE_KEY, 'dark')

        const { result } = renderHook(() => useThemeMode())

        expect(result.current.mode).toBe('dark')
    })

    it('toggles and persists the mode', () => {
        const { result } = renderHook(() => useThemeMode())

        act(() => result.current.toggleMode())

        expect(result.current.mode).toBe('dark')
        expect(window.localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe('dark')
    })
})
