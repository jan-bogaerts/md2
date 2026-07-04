/**
 * Theme configuration model: the user-editable color scheme and markdown styles
 * that feed the global theme service. Kept as plain data so it can be persisted
 * and read outside of React (see theme service and Electron main process).
 */

/** Semantic color roles the app exposes for configuration. */
export type ColorRole = 'primary' | 'secondary'

/** A single color role with its light/regular/dark variants. */
export interface ColorRoleVariants {
    light: string
    regular: string
    dark: string
}

/** The full editable color scheme: one set of variants per role. */
export type ColorSchemeConfig = Record<ColorRole, ColorRoleVariants>

/** Markdown sections that can be styled independently. */
export type MarkdownSection = 'title1' | 'title2' | 'title3' | 'body' | 'caption'

/** Font weight/style formatting flags for a markdown section. */
export interface MarkdownSectionFormatting {
    bold: boolean
    italic: boolean
}

/** Style applied to one markdown section. */
export interface MarkdownSectionStyle {
    fontFamily: string
    fontSize: string
    color: string
    formatting: MarkdownSectionFormatting
}

/** Style config mapping every markdown section to its style. */
export type MarkdownStyleConfig = Record<MarkdownSection, MarkdownSectionStyle>

/** Identifiers of the pre-built markdown style presets shipped with the app. */
export type MarkdownStylePresetName = 'modern' | 'classic' | 'serif' | 'sans-serif' | 'handwritten'

export const MARKDOWN_STYLE_PRESET_NAMES: MarkdownStylePresetName[] = [
    'modern',
    'classic',
    'serif',
    'sans-serif',
    'handwritten',
]

export const COLOR_ROLES: ColorRole[] = ['primary', 'secondary']

export const MARKDOWN_SECTIONS: MarkdownSection[] = ['title1', 'title2', 'title3', 'body', 'caption']

/** Default color scheme; role variants mirror MUI's default primary/secondary tones. */
export const DEFAULT_COLOR_SCHEME: ColorSchemeConfig = {
    primary: { light: '#42a5f5', regular: '#1976d2', dark: '#1565c0' },
    secondary: { light: '#ba68c8', regular: '#9c27b0', dark: '#7b1fa2' },
}

const MODERN_FONT = '"Inter", "Segoe UI", "Roboto", sans-serif'
const CLASSIC_FONT = '"Georgia", "Times New Roman", serif'
const SERIF_FONT = '"Merriweather", "Georgia", serif'
const SANS_SERIF_FONT = '"Helvetica Neue", "Arial", sans-serif'
const HANDWRITTEN_FONT = '"Caveat", "Comic Sans MS", cursive'

const INHERIT_COLOR = 'inherit'

function buildMarkdownStyle(fontFamily: string): MarkdownStyleConfig {
    return {
        title1: { fontFamily, fontSize: '2rem', color: INHERIT_COLOR, formatting: { bold: true, italic: false } },
        title2: { fontFamily, fontSize: '1.5rem', color: INHERIT_COLOR, formatting: { bold: true, italic: false } },
        title3: { fontFamily, fontSize: '1.25rem', color: INHERIT_COLOR, formatting: { bold: true, italic: false } },
        body: { fontFamily, fontSize: '1rem', color: INHERIT_COLOR, formatting: { bold: false, italic: false } },
        caption: { fontFamily, fontSize: '0.85rem', color: INHERIT_COLOR, formatting: { bold: false, italic: true } },
    }
}

/** Pre-built markdown style presets selectable by the user. */
export const MARKDOWN_STYLE_PRESETS: Record<MarkdownStylePresetName, MarkdownStyleConfig> = {
    modern: buildMarkdownStyle(MODERN_FONT),
    classic: buildMarkdownStyle(CLASSIC_FONT),
    serif: buildMarkdownStyle(SERIF_FONT),
    'sans-serif': buildMarkdownStyle(SANS_SERIF_FONT),
    handwritten: buildMarkdownStyle(HANDWRITTEN_FONT),
}

export const DEFAULT_MARKDOWN_STYLE_PRESET: MarkdownStylePresetName = 'modern'

/** Type guard for a persisted markdown style preset name. */
export function isMarkdownStylePresetName(value: unknown): value is MarkdownStylePresetName {
    return typeof value === 'string' && MARKDOWN_STYLE_PRESET_NAMES.includes(value as MarkdownStylePresetName)
}

function isColorRoleVariants(value: unknown): value is ColorRoleVariants {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Record<string, unknown>
    return (
        typeof candidate.light === 'string' &&
        typeof candidate.regular === 'string' &&
        typeof candidate.dark === 'string'
    )
}

/** Type guard for a persisted color scheme; every role must carry valid variants. */
export function isColorSchemeConfig(value: unknown): value is ColorSchemeConfig {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Record<string, unknown>
    return COLOR_ROLES.every((role) => isColorRoleVariants(candidate[role]))
}
