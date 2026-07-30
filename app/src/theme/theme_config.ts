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

/** Markdown elements that can be styled independently. */
export type MarkdownSection =
    | 'title1'
    | 'title2'
    | 'title3'
    | 'body'
    | 'caption'
    | 'link'
    | 'list'
    | 'blockquote'
    | 'inlineCode'
    | 'codeBlock'
    | 'table'

/** Font formatting flags for a markdown section. */
export interface MarkdownSectionFormatting {
    bold: boolean
    italic: boolean
    underline: boolean
}

/** Style applied to one markdown section. */
export interface MarkdownSectionStyle {
    color: string
    fontFamily: string
    fontSize: string
    formatting: MarkdownSectionFormatting
    lineHeight: string
    marginBottom: string
    marginTop: string
}

/** Style config mapping every markdown section to its style. */
export type MarkdownStyleConfig = Record<MarkdownSection, MarkdownSectionStyle>

/** Identifiers of the pre-built markdown style presets shipped with the app. */
export type MarkdownStylePresetName = 'modern' | 'classic' | 'serif' | 'sans-serif' | 'handwritten'

/** Every selectable markdown style, including the user-edited global style. */
export type MarkdownStyleName = MarkdownStylePresetName | 'custom'

export const MARKDOWN_STYLE_PRESET_NAMES: MarkdownStylePresetName[] = [
    'modern',
    'classic',
    'serif',
    'sans-serif',
    'handwritten',
]

export const MARKDOWN_STYLE_NAMES: MarkdownStyleName[] = [...MARKDOWN_STYLE_PRESET_NAMES, 'custom']

export const COLOR_ROLES: ColorRole[] = ['primary', 'secondary']

export const MARKDOWN_SECTIONS: MarkdownSection[] = [
    'title1',
    'title2',
    'title3',
    'body',
    'caption',
    'link',
    'list',
    'blockquote',
    'inlineCode',
    'codeBlock',
    'table',
]

/** Default color scheme used by the polished light and dark application palettes. */
export const DEFAULT_COLOR_SCHEME: ColorSchemeConfig = {
    primary: { light: '#5b9be8', regular: '#1565c0', dark: '#0d47a1' },
    secondary: { light: '#c77ff2', regular: '#7b1fa2', dark: '#5e167d' },
}

const MODERN_FONT = '"Inter", "Segoe UI", "Roboto", sans-serif'
const CLASSIC_FONT = '"Georgia", "Times New Roman", serif'
const SERIF_FONT = '"Merriweather", "Georgia", serif'
const SANS_SERIF_FONT = '"Helvetica Neue", "Arial", sans-serif'
const HANDWRITTEN_FONT = '"Caveat", "Comic Sans MS", cursive'
const MONOSPACE_FONT = '"Cascadia Code", "Consolas", monospace'
const INHERIT_COLOR = 'inherit'

function createFormatting(bold: boolean, italic: boolean, underline: boolean): MarkdownSectionFormatting {
    return { bold, italic, underline }
}

function createSectionStyle(
    fontFamily: string,
    fontSize: string,
    lineHeight: string,
    marginTop: string,
    marginBottom: string,
    formatting: MarkdownSectionFormatting,
): MarkdownSectionStyle {
    return { color: INHERIT_COLOR, fontFamily, fontSize, formatting, lineHeight, marginBottom, marginTop }
}

function buildMarkdownStyle(fontFamily: string): MarkdownStyleConfig {
    return {
        title1: createSectionStyle(fontFamily, '18px', '1.3', '0', '0.4em', createFormatting(true, false, false)),
        title2: createSectionStyle(fontFamily, '16px', '1.3', '0.8em', '0.4em', createFormatting(true, false, false)),
        title3: createSectionStyle(fontFamily, '15px', '1.3', '0.8em', '0.4em', createFormatting(true, false, false)),
        body: createSectionStyle(fontFamily, '14px', '1.5', '0', '0.75em', createFormatting(false, false, false)),
        caption: createSectionStyle(fontFamily, '12px', '1.4', '0', '0.5em', createFormatting(false, true, false)),
        link: createSectionStyle(fontFamily, 'inherit', 'inherit', '0', '0', createFormatting(false, false, true)),
        list: createSectionStyle(fontFamily, '14px', '1.35', '0', '0.75em', createFormatting(false, false, false)),
        blockquote: createSectionStyle(fontFamily, '14px', '1.5', '0', '0.75em', createFormatting(false, true, false)),
        inlineCode: createSectionStyle(MONOSPACE_FONT, '0.9em', 'inherit', '0', '0', createFormatting(false, false, false)),
        codeBlock: createSectionStyle(MONOSPACE_FONT, '13px', '1.45', '0', '0.75em', createFormatting(false, false, false)),
        table: createSectionStyle(fontFamily, '13px', '1.4', '0', '0.75em', createFormatting(false, false, false)),
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

/** Type guard for a persisted markdown style name. */
export function isMarkdownStyleName(value: unknown): value is MarkdownStyleName {
    return value === 'custom' || isMarkdownStylePresetName(value)
}

function isMarkdownSectionFormatting(value: unknown): value is MarkdownSectionFormatting {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Record<string, unknown>

    return typeof candidate.bold === 'boolean'
        && typeof candidate.italic === 'boolean'
        && typeof candidate.underline === 'boolean'
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function isMarkdownSectionStyle(value: unknown): value is MarkdownSectionStyle {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Record<string, unknown>

    return isNonEmptyString(candidate.color)
        && isNonEmptyString(candidate.fontFamily)
        && isNonEmptyString(candidate.fontSize)
        && isMarkdownSectionFormatting(candidate.formatting)
        && isNonEmptyString(candidate.lineHeight)
        && isNonEmptyString(candidate.marginBottom)
        && isNonEmptyString(candidate.marginTop)
}

/** Type guard for custom markdown styles restored from local storage. */
export function isMarkdownStyleConfig(value: unknown): value is MarkdownStyleConfig {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Record<string, unknown>

    return MARKDOWN_SECTIONS.every((section) => isMarkdownSectionStyle(candidate[section]))
}

/** Create an editable copy without sharing nested formatting objects with a preset. */
export function cloneMarkdownStyleConfig(value: MarkdownStyleConfig): MarkdownStyleConfig {
    return MARKDOWN_SECTIONS.reduce((result, section) => ({
        ...result,
        [section]: { ...value[section], formatting: { ...value[section].formatting } },
    }), {} as MarkdownStyleConfig)
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
