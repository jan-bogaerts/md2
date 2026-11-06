import type { ActionEditorState, ActionPhrase, ActionPhraseEditorState } from '../../../data/action_types'
import { generateUuid } from '../../../data/uuid'

export const ACTION_DEFINITION_TAB = 'definition'
const PHRASE_TAB_PREFIX = 'phrase-'
export const ACTION_PROMPT_TAB = 'prompt'

function phraseMatches(left: ActionPhrase, right: ActionPhrase) {
    return left.text === right.text && left.title === right.title
}

function newPhraseEditorState(phrase: ActionPhrase): ActionPhraseEditorState {
    return { identity: `${PHRASE_TAB_PREFIX}${generateUuid()}`, phrase }
}

/** Match phrases to the entry at the same index when both hold equal content. */
function matchSameIndex(
    entries: ActionPhraseEditorState[],
    phrases: ActionPhrase[],
    usedEntries: Set<number>,
): (ActionPhraseEditorState | undefined)[] {
    return phrases.map((phrase, index) => {
        const entry = entries[index]
        if (!entry || !phraseMatches(entry.phrase, phrase)) return undefined

        usedEntries.add(index)
        return entry
    })
}

/** Match remaining phrases to the first unused entry with equal content. */
function matchByContent(
    entries: ActionPhraseEditorState[],
    phrases: ActionPhrase[],
    usedEntries: Set<number>,
    matched: (ActionPhraseEditorState | undefined)[],
) {
    for (const [index, phrase] of phrases.entries()) {
        if (matched[index]) continue
        const entryIndex = entries.findIndex((entry, candidate) => (
            !usedEntries.has(candidate) && phraseMatches(entry.phrase, phrase)
        ))
        if (entryIndex < 0) continue

        usedEntries.add(entryIndex)
        matched[index] = entries[entryIndex]
    }
}

/** Take the first unused entry in order; the phrase was edited rather than replaced. */
function takeUnusedEntry(entries: ActionPhraseEditorState[], usedEntries: Set<number>) {
    const entryIndex = entries.findIndex((_entry, candidate) => !usedEntries.has(candidate))
    if (entryIndex < 0) return undefined

    usedEntries.add(entryIndex)
    return entries[entryIndex]
}

/** Reconcile transient editor identities with current persisted phrase values. */
export function reconcileActionPhraseEditorState(
    current: ActionEditorState | undefined,
    phrases: ActionPhrase[],
): ActionEditorState {
    const entries = current?.phrases ?? []
    const usedEntries = new Set<number>()
    const matched = matchSameIndex(entries, phrases, usedEntries)
    matchByContent(entries, phrases, usedEntries, matched)
    const nextPhrases = phrases.map((phrase, index) => (
        matched[index] ?? takeUnusedEntry(entries, usedEntries) ?? newPhraseEditorState(phrase)
    ))
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
