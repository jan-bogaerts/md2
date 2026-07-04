import { useContext } from 'react'
import { AppThemeContext, type AppThemeContextValue } from './theme_context'

/** Access the global theme service; throws when used outside AppThemeProvider. */
export function useAppTheme(): AppThemeContextValue {
    const value = useContext(AppThemeContext)
    if (value === null) throw new Error('useAppTheme must be used within an AppThemeProvider')

    return value
}
