import { describe, expect, it } from 'vitest'
import { diagramCreationTools } from './diagram_creation_tools'

describe('diagramCreationTools', () => {
    it('offers only Root before a mindmap root exists', () => {
        expect(diagramCreationTools('mindmap', null).map(({ label }) => label)).toEqual(['Root', 'Group'])
    })

    it('offers Topic and Connection after a mindmap root exists', () => {
        expect(diagramCreationTools('mindmap', null, true).map(({ label }) => label))
            .toEqual(['Topic', 'Connection', 'Group'])
    })
})
