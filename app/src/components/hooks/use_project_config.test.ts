import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectConfig } from '../../data/data_types'
import type { DataService } from '../../services/data/data_service'
import { useProjectConfig } from './use_project_config'

const firstConfig: ProjectConfig = {
    actionsFolder: 'actions',
    archivedFolder: 'archived',
    backgroundShade: 'blue',
    cardSeparator: '_',
    cardTypes: [{ color: '#111111', idPrefix: 'F', label: 'Feature', type: 'feature' }],
    diagramFooter: 'Save to {{diagram-file}}.',
    diagramsFolder: 'diagrams',
    diffCommand: 'git show {{commit}}',
    projectFolder: '',
    pushMode: 'auto',
    releasesFolder: 'releases',
    states: [{ alwaysVisible: true, state: 'design' }],
    workingFolder: 'design',
}

const secondConfig: ProjectConfig = {
    ...firstConfig,
    backgroundShade: 'green',
    pushMode: 'manual',
    workingFolder: 'docs',
}

class TestProjectConfigService extends EventTarget {
    private config: ProjectConfig | null = firstConfig

    getConfig() {
        return this.config
    }

    setConfig(config: ProjectConfig | null) {
        this.config = config
        this.dispatchEvent(new CustomEvent('changed'))
    }
}

describe('useProjectConfig', () => {
    afterEach(cleanup)

    it('updates when the data service emits changed', () => {
        const service = new TestProjectConfigService()
        const { result } = renderHook(() => useProjectConfig(service as unknown as DataService))

        expect(result.current?.workingFolder).toBe('design')

        act(() => {
            service.setConfig(secondConfig)
        })

        expect(result.current?.workingFolder).toBe('docs')
        expect(result.current?.backgroundShade).toBe('green')
        expect(result.current?.pushMode).toBe('manual')
    })
})
