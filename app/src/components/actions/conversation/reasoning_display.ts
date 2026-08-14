interface ReasoningTextSource {
    content?: string
    details?: string[]
    summary?: string[]
}

/** Selects provider reasoning sections and reports whether selected text is displayable. */
export function reasoningDisplay(source: ReasoningTextSource) {
    const sections = source.summary && source.summary.length > 0
        ? source.summary
        : source.details && source.details.length > 0
            ? source.details
            : source.content ? [source.content] : []

    return { hasText: sections.some((section) => section.trim().length > 0), sections }
}
