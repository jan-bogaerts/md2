import type { ActionDefinition as SharedActionDefinition, ActionPhrase } from '../../../shared/action_definitions.mjs'

export {
    ACTION_APPLIES_TO_FIELDS,
    ACTION_AUTO_FINISH_FIELDS,
    ACTION_DEFINITION_FIELDS,
    ACTION_ON_RULE_FIELDS,
    ACTION_OUTPUT_FIELDS,
    ACTION_PHRASE_FIELDS,
    BUILTIN_CUSTOM_PROMPT,
    BUILTIN_REMARKABLE_CONVERT,
    CUSTOM_PROMPT_ACTION_ID,
    REMARKABLE_CONVERT_ACTION_ID,
} from '../../../shared/action_definitions.mjs'

export type {
    ActionAppliesTo,
    ActionAppliesToField,
    ActionAutoFinish,
    ActionDefinitionEntry,
    ActionFile,
    ActionPhrase,
    ActionOutput,
    ActionType,
    OnRule,
    RawActionDefinition,
    RawActionDefinitionEntry,
    RawOnRule,
} from '../../../shared/action_definitions.mjs'

export interface ActionPhraseEditorState {
    identity: string
    phrase: ActionPhrase
}

export interface ActionEditorState {
    phrases: ActionPhraseEditorState[]
    selectedTab: string
}

/** Loaded action plus temporary editor state that is never serialized. */
export interface ActionDefinition extends SharedActionDefinition {
    editorState?: ActionEditorState
}
