import { describe, expect, it, vi } from 'vitest'
import type { ActionEditorState, ActionPhrase } from '../../../data/action_types'
import { reconcileActionPhraseEditorState } from './action_phrase_editor_state'

const ALPHA = { text: 'Alpha text', title: 'Alpha' }
const BETA = { text: 'Beta text', title: 'Beta' }
const GAMMA = { text: 'Gamma text', title: 'Gamma' }

function identities(state: ActionEditorState) {
    return state.phrases.map(({ identity }) => identity)
}

describe('reconcileActionPhraseEditorState', () => {
    it('keeps phrase identities through insertion, deletion, and reordering', () => {
        vi.spyOn(crypto, 'randomUUID')
            .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
            .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
            .mockReturnValueOnce('00000000-0000-4000-8000-000000000003')
            .mockReturnValueOnce('00000000-0000-4000-8000-000000000004')
        const initial = reconcileActionPhraseEditorState(undefined, [ALPHA, BETA, GAMMA])
        const [alphaIdentity, betaIdentity, gammaIdentity] = identities(initial)
        const reordered = reconcileActionPhraseEditorState(initial, [GAMMA, ALPHA, BETA])
        const inserted = reconcileActionPhraseEditorState(reordered, [GAMMA, ALPHA, { text: 'Delta text', title: 'Delta' }, BETA])
        const deleted = reconcileActionPhraseEditorState(inserted, [GAMMA, { text: 'Delta text', title: 'Delta' }, BETA])

        expect(identities(reordered)).toEqual([gammaIdentity, alphaIdentity, betaIdentity])
        expect(identities(inserted)).toEqual([gammaIdentity, alphaIdentity, 'phrase-00000000-0000-4000-8000-000000000004', betaIdentity])
        expect(identities(deleted)).toEqual([gammaIdentity, 'phrase-00000000-0000-4000-8000-000000000004', betaIdentity])
    })

    it('keeps duplicate phrases distinct by occurrence', () => {
        const duplicate: ActionPhrase = { text: 'Same text', title: 'Same title' }
        const initial = reconcileActionPhraseEditorState(undefined, [duplicate, duplicate])
        const reconciled = reconcileActionPhraseEditorState(initial, [duplicate, duplicate])

        expect(new Set(identities(initial)).size).toBe(2)
        expect(identities(reconciled)).toEqual(identities(initial))
    })

    it('keeps selected phrase through reordering and selects Prompt when removed', () => {
        const initial = reconcileActionPhraseEditorState(undefined, [ALPHA, BETA])
        const selected = { ...initial, selectedTab: initial.phrases[1].identity }
        const reordered = reconcileActionPhraseEditorState(selected, [BETA, ALPHA])
        const removed = reconcileActionPhraseEditorState(reordered, [ALPHA])

        expect(reordered.selectedTab).toBe(initial.phrases[1].identity)
        expect(removed.selectedTab).toBe('prompt')
    })
})
