import { describe, expect, it } from 'vitest'
import { createAppTheme } from './app_theme'
import { PROJECT_BACKGROUND_SHADES } from './project_background_shade'
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

    it('provides reusable light and dark chart palettes', () => {
        const light = createAppTheme('light').palette.custom.chartPalette
        const dark = createAppTheme('dark').palette.custom.chartPalette

        expect(light).toHaveLength(8)
        expect(dark).toHaveLength(8)
        expect(light).not.toEqual(dark)
    })

    it('splits per-agent chart families as disjoint subsets of the mode palette', () => {
        for (const mode of ['light', 'dark'] as const) {
            const { chartPalette, chartPalettes } = createAppTheme(mode).palette.custom
            const { claude, codex } = chartPalettes

            expect(claude.length).toBeGreaterThan(0)
            expect(codex.length).toBeGreaterThan(0)
            expect(claude.every((color) => chartPalette.includes(color))).toBe(true)
            expect(codex.every((color) => chartPalette.includes(color))).toBe(true)
            expect(claude.filter((color) => codex.includes(color))).toEqual([])
        }
    })

    it('keeps the shared background neutral for every project shade', () => {
        for (const mode of ['light', 'dark'] as const) {
            const neutralBackground = createAppTheme(mode).palette.background

            for (const shade of PROJECT_BACKGROUND_SHADES) {
                const { background } = createAppTheme(mode, DEFAULT_COLOR_SCHEME, shade).palette

                expect(background.default).toBe(neutralBackground.default)
                expect(background.paper).toBe(neutralBackground.paper)
            }
        }
    })

    it('applies the project shade to the view-only project background', () => {
        for (const mode of ['light', 'dark'] as const) {
            const neutralProjectBackground = createAppTheme(mode, DEFAULT_COLOR_SCHEME, 'neutral').palette.custom.projectBackground
            const blueProjectBackground = createAppTheme(mode, DEFAULT_COLOR_SCHEME, 'blue').palette.custom.projectBackground

            expect(blueProjectBackground).not.toBe(neutralProjectBackground)
        }
    })

})
