import type { ActionEditorState, ActionPhrase, ActionPhraseEditorState } from '../../data/action_types'

export const ACTION_DEFINITION_TAB = 'definition'
const PHRASE_TAB_PREFIX = 'phrase-'
export const ACTION_PROMPT_TAB = 'prompt'

function phraseMatches(left: ActionPhrase, right: ActionPhrase) {
    return left.text === right.text && left.title === right.title
}

function newPhraseEditorState(phrase: ActionPhrase): ActionPhraseEditorState {
    return { identity: `${PHRASE_TAB_PREFIX}${crypto.randomUUID()}`, phrase }
}

/** Reconcile transient editor identities with current persisted phrase values. */
export function reconcileActionPhraseEditorState(
    current: ActionEditorState | undefined,
    phrases: ActionPhrase[],
): ActionEditorState {
    const unmatched = [...(current?.phrases ?? [])]
    const nextPhrases = phrases.map((phrase) => {
        const matchingIndex = unmatched.findIndex((entry) => phraseMatches(entry.phrase, phrase))
        if (matchingIndex < 0) return newPhraseEditorState(phrase)

        const [matching] = unmatched.splice(matchingIndex, 1)
        return matching
    })
    const selectedTab = current?.selectedTab ?? ACTION_DEFINITION_TAB
    const selectedPhraseExists = nextPhrases.some(({ identity }) => identity === selectedTab)
    const nextSelectedTab = selectedTab.startsWith(PHRASE_TAB_PREFIX) && !selectedPhraseExists
        ? ACTION_PROMPT_TAB
        : selectedTab

    const unchanged = current
        && current.selectedTab === nextSelectedTab
        && current.phrases.length === nextPhrases.length
        && current.phrases.every(({ identity }, index) => identity === nextPhrases[index].identity)

    return unchanged ? current : { phrases: nextPhrases, selectedTab: nextSelectedTab }
}
