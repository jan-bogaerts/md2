import { describe, expect, it } from 'vitest'
import {
    COLOR_ROLES,
    DEFAULT_COLOR_SCHEME,
    DEFAULT_MARKDOWN_STYLE_PRESET,
    MARKDOWN_SECTIONS,
    MARKDOWN_STYLE_PRESET_NAMES,
    MARKDOWN_STYLE_PRESETS,
    isColorSchemeConfig,
    isMarkdownStylePresetName,
} from './theme_config'

describe('theme_config', () => {
    it('ships all listed markdown style presets', () => {
        expect(MARKDOWN_STYLE_PRESET_NAMES).toEqual(['modern', 'classic', 'serif', 'sans-serif', 'handwritten'])
        MARKDOWN_STYLE_PRESET_NAMES.forEach((name) => {
            expect(MARKDOWN_STYLE_PRESETS[name]).toBeDefined()
        })
    })

    it('defines every markdown section in each preset', () => {
        MARKDOWN_STYLE_PRESET_NAMES.forEach((name) => {
            MARKDOWN_SECTIONS.forEach((section) => {
                expect(MARKDOWN_STYLE_PRESETS[name][section].fontFamily).toBeTruthy()
            })
        })
    })

    it('defines light/regular/dark variants for every color role', () => {
        COLOR_ROLES.forEach((role) => {
            const variants = DEFAULT_COLOR_SCHEME[role]
            expect(variants.light).toMatch(/^#/)
            expect(variants.regular).toMatch(/^#/)
            expect(variants.dark).toMatch(/^#/)
        })
    })

    it('uses a shipped preset as the default markdown style', () => {
        expect(MARKDOWN_STYLE_PRESET_NAMES).toContain(DEFAULT_MARKDOWN_STYLE_PRESET)
    })

    it('validates persisted markdown preset names', () => {
        expect(isMarkdownStylePresetName('classic')).toBe(true)
        expect(isMarkdownStylePresetName('unknown')).toBe(false)
        expect(isMarkdownStylePresetName(42)).toBe(false)
    })

    it('validates persisted color schemes', () => {
        expect(isColorSchemeConfig(DEFAULT_COLOR_SCHEME)).toBe(true)
        expect(isColorSchemeConfig({ primary: { light: '#fff', regular: '#000' } })).toBe(false)
        expect(isColorSchemeConfig(null)).toBe(false)
    })
})
