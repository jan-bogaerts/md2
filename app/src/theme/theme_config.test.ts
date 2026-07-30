import { describe, expect, it } from 'vitest'
import {
    DEFAULT_COLOR_SCHEME,
    MARKDOWN_STYLE_PRESETS,
    cloneMarkdownStyleConfig,
    isColorSchemeConfig,
    isMarkdownStyleConfig,
    isMarkdownStyleName,
    isMarkdownStylePresetName,
} from './theme_config'

describe('theme_config', () => {
    it('includes custom as a selectable style without treating it as a preset', () => {
        expect(isMarkdownStyleName('custom')).toBe(true)
        expect(isMarkdownStylePresetName('custom')).toBe(false)
    })

    it('validates and clones complete custom markdown styles', () => {
        const clone = cloneMarkdownStyleConfig(MARKDOWN_STYLE_PRESETS.modern)

        expect(isMarkdownStyleConfig(clone)).toBe(true)
        expect(clone).not.toBe(MARKDOWN_STYLE_PRESETS.modern)
        expect(clone.body.formatting).not.toBe(MARKDOWN_STYLE_PRESETS.modern.body.formatting)
        expect(isMarkdownStyleConfig({ ...clone, table: { ...clone.table, fontSize: '' } })).toBe(false)
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
