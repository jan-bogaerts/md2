import { describe, expect, it } from 'vitest'
import {
    createDefaultSentryProjectSettings,
    isSentryConfigurationComplete,
    type SentryProjectSettings,
} from './sentry_types'

function completeSettings(): SentryProjectSettings {
    return {
        ...createDefaultSentryProjectSettings(),
        apiToken: 'token',
        cardState: 'to fix',
        cardType: 'Bug',
        organization: 'acme',
        project: 'frontend',
    }
}

describe('isSentryConfigurationComplete', () => {
    it('accepts settings with every required field filled in', () => {
        expect(isSentryConfigurationComplete(completeSettings())).toBe(true)
    })

    const blankFields: (keyof SentryProjectSettings)[] = [
        'apiBaseUrl',
        'apiToken',
        'cardState',
        'cardType',
        'environment',
        'organization',
        'project',
    ]

    it.each(blankFields)('rejects settings with an empty %s', (field) => {
        expect(isSentryConfigurationComplete({ ...completeSettings(), [field]: '' })).toBe(false)
    })

    it.each(blankFields.filter((field) => field !== 'cardType'))('rejects settings with a whitespace-only %s', (field) => {
        expect(isSentryConfigurationComplete({ ...completeSettings(), [field]: '   ' })).toBe(false)
    })
})
