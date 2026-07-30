import { describe, expect, it } from 'vitest'
import { createAppTheme } from './app_theme'
import { DEFAULT_COLOR_SCHEME } from './theme_config'

describe('createAppTheme', () => {
    it('builds the requested palette mode', () => {
        expect(createAppTheme('light').palette.mode).toBe('light')
        expect(createAppTheme('dark').palette.mode).toBe('dark')
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

    it('aliases list-editor custom roles to existing theme colors', () => {
        const theme = createAppTheme('light')

        expect(theme.palette.custom.track).toBe(theme.palette.action.hover)
        expect(theme.palette.custom.primaryBg).toBe(theme.palette.action.selected)
        expect(theme.palette.custom.borderStrong).toBe(theme.palette.divider)
    })

})
