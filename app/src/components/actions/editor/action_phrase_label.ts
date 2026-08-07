const PHRASE_LABEL_LENGTH = 30
const UNTITLED_PHRASE_LABEL = 'Untitled phrase'

/** Use explicit title, else shortened first Markdown line, for compact phrase controls. */
export function actionPhraseLabel(title: string, text: string) {
    if (title.trim().length > 0) return title

    const firstLine = text.split(/\r?\n/u)[0].trim()
    if (firstLine.length === 0) return UNTITLED_PHRASE_LABEL
    if (firstLine.length <= PHRASE_LABEL_LENGTH) return firstLine

    return `${firstLine.slice(0, PHRASE_LABEL_LENGTH - 1)}â€¦`
}
