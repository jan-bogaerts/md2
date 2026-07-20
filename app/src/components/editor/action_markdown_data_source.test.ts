import { describe, expect, it, vi } from 'vitest'
import { ActionService } from '../../services/actions/action_service'
import { ActionMarkdownDataSource, actionMarkdownDocumentId } from './action_markdown_data_source'
import type { MarkdownReplacedDetail } from './markdown_data_source'

function setup() {
    const service = new ActionService(() => ({ persistActionFile: vi.fn(async () => undefined) }))
    service.loadFromFiles([{
        content: JSON.stringify({
            description: 'Review', id: 'review', label: 'Review',
            phrases: [{ text: 'Run tests', title: 'Tests' }], prompt: 'Review it', type: 'agent',
        }),
        path: 'actions/review.json',
    }])
    service.setActionEditorState('actions/review.json', {
        phrases: [{ identity: 'phrase-stable', phrase: { text: 'Run tests', title: 'Tests' } }],
        selectedTab: 'prompt',
    })
    const source = new ActionMarkdownDataSource()
    source.init(service)

    return { service, source }
}

describe('ActionMarkdownDataSource', () => {
    it('writes prompt and phrase by full outgoing document ID', () => {
        const { service, source } = setup()
        const promptId = actionMarkdownDocumentId('project', 'review', 'prompt')
        const phraseId = actionMarkdownDocumentId('project', 'review', 'phrase-stable')

        source.edit('list-action', promptId, 'Prompt edited')
        source.commit('list-action', phraseId, 'Phrase edited')

        const definition = service.getDraft('actions/review.json').definition
        expect(definition.prompt).toBe('Prompt edited')
        expect(definition.phrases?.[0].text).toBe('Phrase edited')
    })

    it('emits per-document echo origin after accepted commit', () => {
        const { source } = setup()
        const promptId = actionMarkdownDocumentId('project', 'review', 'prompt')
        source.getMarkdown(promptId)
        const replaced = vi.fn()
        source.addEventListener('markdownReplaced', replaced)

        expect(source.commit('list-action', promptId, 'Edited')).toBe(true)

        const detail = (replaced.mock.calls[0][0] as CustomEvent<MarkdownReplacedDetail>).detail
        expect(detail).toEqual({ documentId: promptId, originBinding: 'list-action' })
    })
})
