interface MarkdownEditorStageEventDetail {
    results: boolean[]
}

const MARKDOWN_EDITOR_STAGE_EVENT = 'stage'
const markdownEditorStageTarget = new EventTarget()

export function registerMarkdownEditorStage(stage: () => boolean) {
    const handleStage = (event: Event) => {
        const detail = (event as CustomEvent<MarkdownEditorStageEventDetail>).detail
        try {
            detail.results.push(stage())
        } catch {
            detail.results.push(false)
        }
    }
    markdownEditorStageTarget.addEventListener(MARKDOWN_EDITOR_STAGE_EVENT, handleStage)

    return () => markdownEditorStageTarget.removeEventListener(MARKDOWN_EDITOR_STAGE_EVENT, handleStage)
}

/** Stages every mounted Markdown editor and reports whether all accepted their buffer. */
export function stageMarkdownEditors() {
    const detail: MarkdownEditorStageEventDetail = { results: [] }
    markdownEditorStageTarget.dispatchEvent(new CustomEvent(MARKDOWN_EDITOR_STAGE_EVENT, { detail }))

    return detail.results.every((result) => result)
}
