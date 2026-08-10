export type ActionUsageScope = 'actionCard' | 'conversation'

/** Owns shared usage scope for one action popup binding. */
export class ActionUsageScopeStore extends EventTarget {
    private scope: ActionUsageScope = 'actionCard'

    readonly getSnapshot = () => this.scope

    readonly subscribe = (onStoreChange: () => void) => {
        this.addEventListener('changed', onStoreChange)

        return () => this.removeEventListener('changed', onStoreChange)
    }

    toggle(conversationAvailable: boolean) {
        if (this.scope === 'actionCard' && !conversationAvailable) return

        this.publish(this.scope === 'actionCard' ? 'conversation' : 'actionCard')
    }

    useActionCardScope() {
        this.publish('actionCard')
    }

    private publish(scope: ActionUsageScope) {
        if (scope === this.scope) return

        this.scope = scope
        this.dispatchEvent(new Event('changed'))
    }
}
