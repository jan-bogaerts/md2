import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
    COLOR_SCHEME_STORAGE_KEY,
    CUSTOM_MARKDOWN_STYLE_STORAGE_KEY,
    MARKDOWN_STYLE_STORAGE_KEY,
    THEME_MODE_STORAGE_KEY,
    useThemeSettings,
} from './use_theme_settings'
import { DEFAULT_COLOR_SCHEME, DEFAULT_MARKDOWN_STYLE_PRESET, MARKDOWN_STYLE_PRESETS } from './theme_config'

describe('useThemeSettings', () => {
    afterEach(() => {
        window.localStorage.clear()
    })

    it('defaults to light with the default scheme and markdown style', () => {
        const { result } = renderHook(() => useThemeSettings())

        expect(result.current.mode).toBe('light')
        expect(result.current.colorScheme).toEqual(DEFAULT_COLOR_SCHEME)
        expect(result.current.markdownStyle).toBe(DEFAULT_MARKDOWN_STYLE_PRESET)
        expect(result.current.markdownStyleConfig).toEqual(MARKDOWN_STYLE_PRESETS[DEFAULT_MARKDOWN_STYLE_PRESET])
    })

    it('restores persisted settings', () => {
        window.localStorage.setItem(THEME_MODE_STORAGE_KEY, 'dark')
        window.localStorage.setItem(MARKDOWN_STYLE_STORAGE_KEY, 'serif')
        const scheme = { ...DEFAULT_COLOR_SCHEME, primary: { light: '#a', regular: '#b', dark: '#c' } }
        window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, JSON.stringify(scheme))

        const { result } = renderHook(() => useThemeSettings())

        expect(result.current.mode).toBe('dark')
        expect(result.current.markdownStyle).toBe('serif')
        expect(result.current.colorScheme.primary.regular).toBe('#b')
    })

    it('ignores corrupt persisted values', () => {
        window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, 'not-json')
        window.localStorage.setItem(MARKDOWN_STYLE_STORAGE_KEY, 'bogus')

        const { result } = renderHook(() => useThemeSettings())

        expect(result.current.colorScheme).toEqual(DEFAULT_COLOR_SCHEME)
        expect(result.current.markdownStyle).toBe(DEFAULT_MARKDOWN_STYLE_PRESET)
    })

    it('toggles and persists the mode', () => {
        const { result } = renderHook(() => useThemeSettings())

        act(() => result.current.toggleMode())

        expect(result.current.mode).toBe('dark')
        expect(window.localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe('dark')
    })

    it('persists color scheme and markdown style changes', () => {
        const { result } = renderHook(() => useThemeSettings())
        const scheme = { ...DEFAULT_COLOR_SCHEME, secondary: { light: '#1', regular: '#2', dark: '#3' } }

        act(() => result.current.setColorScheme(scheme))
        act(() => result.current.setMarkdownStyle('handwritten'))

        expect(result.current.colorScheme.secondary.regular).toBe('#2')
        expect(result.current.markdownStyle).toBe('handwritten')
        expect(window.localStorage.getItem(MARKDOWN_STYLE_STORAGE_KEY)).toBe('handwritten')
        expect(JSON.parse(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)!).secondary.regular).toBe('#2')
    })

    it('persists and restores a custom markdown style', () => {
        const firstHook = renderHook(() => useThemeSettings())
        const customConfig = {
            ...MARKDOWN_STYLE_PRESETS.modern,
            body: { ...MARKDOWN_STYLE_PRESETS.modern.body, fontSize: '1.2rem' },
        }

        act(() => firstHook.result.current.setCustomMarkdownStyle(customConfig))

        expect(firstHook.result.current.markdownStyle).toBe('custom')
        expect(firstHook.result.current.markdownStyleConfig.body.fontSize).toBe('1.2rem')
        expect(window.localStorage.getItem(MARKDOWN_STYLE_STORAGE_KEY)).toBe('custom')
        expect(JSON.parse(window.localStorage.getItem(CUSTOM_MARKDOWN_STYLE_STORAGE_KEY)!).body.fontSize).toBe('1.2rem')

        firstHook.unmount()
        const restoredHook = renderHook(() => useThemeSettings())
        expect(restoredHook.result.current.markdownStyle).toBe('custom')
        expect(restoredHook.result.current.markdownStyleConfig.body.fontSize).toBe('1.2rem')
    })
})
