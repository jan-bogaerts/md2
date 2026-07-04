import { describe, expect, it } from 'vitest'
import { createAppTheme } from './app_theme'
import { DEFAULT_COLOR_SCHEME } from './theme_config'

describe('createAppTheme', () => {
    it('builds a light theme', () => {
        const theme = createAppTheme('light')

        expect(theme.palette.mode).toBe('light')
    })

    it('builds a dark theme', () => {
        const theme = createAppTheme('dark')

        expect(theme.palette.mode).toBe('dark')
    })

    it('feeds the color scheme roles into the palette', () => {
        const colorScheme = {
            ...DEFAULT_COLOR_SCHEME,
            primary: { light: '#111111', regular: '#222222', dark: '#333333' },
        }

        const theme = createAppTheme('light', colorScheme)

        expect(theme.palette.primary.main).toBe('#222222')
        expect(theme.palette.primary.light).toBe('#111111')
        expect(theme.palette.primary.dark).toBe('#333333')
    })

    it('applies the flat, round-cornered look regardless of mode', () => {
        const light = createAppTheme('light')
        const dark = createAppTheme('dark')

        expect(light.shape.borderRadius).toBe(dark.shape.borderRadius)
        expect(light.shape.borderRadius).toBeGreaterThan(0)
    })
})
