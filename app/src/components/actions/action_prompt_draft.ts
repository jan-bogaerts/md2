type PromptDraftListener = () => void

/** Popup-local prompt value with narrow subscriptions for controls that depend on live typing. */
export class ActionPromptDraft {
    private readonly listeners = new Set<PromptDraftListener>()
    private value: string
    readonly resetToken: number

    constructor(initialValue: string, resetToken = 0) {
        this.resetToken = resetToken
        this.value = initialValue
    }

    readonly getSnapshot = () => this.value

    readonly subscribe = (listener: PromptDraftListener) => {
        this.listeners.add(listener)

        return () => this.listeners.delete(listener)
    }

    readonly set = (value: string) => {
        if (this.value === value) return

        this.value = value
        for (const listener of this.listeners) listener()
    }
}
