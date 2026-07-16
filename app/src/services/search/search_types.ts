import type { ActionDefinition } from '../../data/action_types'
import type { ProjectCard } from '../../data/data_types'

export type SearchMode = 'text' | 'regexp'

/** Where a single result's match was found within a card. */
export type SearchMatchSource = 'header' | 'body'

export interface SearchOptions {
    /** When true, background cards are also searched by full body content. */
    includeBackgroundBody: boolean
    /** When true, loaded action definitions are searched. */
    includeActions: boolean
    mode: SearchMode
}

export interface SearchMatch {
    card: ProjectCard
    /** Snippet of the matched text with surrounding context. */
    context: string
    /** Header field the match came from, or `body`. */
    field: string
    path: string
    source: SearchMatchSource
    title: string
}

export interface BackgroundGroup {
    /** First folder segment under the working folder, such as `history` or `architecture`. */
    folder: string
    matches: SearchMatch[]
}

export interface ActionSearchMatch {
    action: ActionDefinition
    context: string
    field: 'label' | 'description' | 'text'
    title: string
}

export interface SearchResults {
    active: SearchMatch[]
    actions: ActionSearchMatch[]
    backgroundGroups: BackgroundGroup[]
}

/** Builds a search expression from a natural-language request, typically via an agent. */
export type SearchRegexpAgent = (naturalQuery: string) => Promise<string>
