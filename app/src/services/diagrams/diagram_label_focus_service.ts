import { register } from '../service_injector';
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
} from './diagram_edit_session_service';

const TARGET_CHANGED_EVENT = 'labelFocus:target';

export type DiagramLabelFocusObjectKind = 'edge' | 'node';

export interface DiagramLabelFocusTarget {
    objectId: string;
    objectKind: DiagramLabelFocusObjectKind;
}

type DiagramLabelFocusSession = {
    read: Pick<DiagramEditSessionService['read'], 'subscribeSession'>;
};

function focusEvent({ objectId, objectKind }: DiagramLabelFocusTarget) {
    return `labelFocus:${objectKind}:${objectId}`;
}

function sameTarget(left: DiagramLabelFocusTarget | null, right: DiagramLabelFocusTarget) {
    return left?.objectId === right.objectId && left.objectKind === right.objectKind;
}

/** Owns one creation-driven label focus request until its matching input accepts it. */
export class DiagramLabelFocusService extends EventTarget {
    private target: DiagramLabelFocusTarget | null = null;

    constructor(session: DiagramLabelFocusSession = diagramEditSessionService) {
        super();
        session.read.subscribeSession(this.clear);
    }

    getTargetSnapshot = () => this.target;

    getFocusSnapshot = (objectKind: DiagramLabelFocusObjectKind, objectId: string) => (
        this.target?.objectKind === objectKind && this.target.objectId === objectId
    );

    subscribeTarget = (listener: () => void) => {
        this.addEventListener(TARGET_CHANGED_EVENT, listener);

        return () => this.removeEventListener(TARGET_CHANGED_EVENT, listener);
    };

    subscribeFocus = (objectKind: DiagramLabelFocusObjectKind, objectId: string, listener: () => void) => {
        const eventName = focusEvent({ objectId, objectKind });
        this.addEventListener(eventName, listener);

        return () => this.removeEventListener(eventName, listener);
    };

    request(target: DiagramLabelFocusTarget) {
        if (target.objectId.trim().length === 0) throw new Error('Diagram label focus object ID is required');
        if (sameTarget(this.target, target)) return false;

        this.setTarget({ ...target });

        return true;
    }

    complete(target: DiagramLabelFocusTarget) {
        if (!sameTarget(this.target, target)) return false;

        this.setTarget(null);

        return true;
    }

    private readonly clear = () => this.setTarget(null);

    private setTarget(target: DiagramLabelFocusTarget | null) {
        if (target === this.target) return false;

        const previous = this.target;
        this.target = target;
        if (previous) this.dispatchEvent(new Event(focusEvent(previous)));
        if (target) this.dispatchEvent(new Event(focusEvent(target)));
        this.dispatchEvent(new Event(TARGET_CHANGED_EVENT));

        return true;
    }
}

export const diagramLabelFocusService = register(
    'diagramLabelFocusService',
    new DiagramLabelFocusService(),
);
