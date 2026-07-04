import { describe, expect, it } from 'vitest'
import { createAppTheme } from './app_theme'

describe('createAppTheme', () => {
    it('builds a light theme', () => {
        const theme = createAppTheme('light')

        expect(theme.palette.mode).toBe('light')
    })

    it('builds a dark theme', () => {
        const theme = createAppTheme('dark')

        expect(theme.palette.mode).toBe('dark')
    })
})
