import { describe, expect, it, vi } from 'vitest';
import { DiagramLabelFocusService } from './diagram_label_focus_service';

class DiagramSessionStub extends EventTarget {
    readonly read = {
        subscribeSession: (listener: () => void) => {
            this.addEventListener('sessionChanged', listener);

            return () => this.removeEventListener('sessionChanged', listener);
        },
    };

    changeSession() {
        this.dispatchEvent(new Event('sessionChanged'));
    }
}

describe('DiagramLabelFocusService', () => {
    it('keeps a request pending until its matching input completes it', () => {
        const focus = new DiagramLabelFocusService(new DiagramSessionStub());
        const nodeChanged = vi.fn();
        focus.subscribeFocus('node', 'new-node', nodeChanged);

        expect(focus.request({ objectId: 'new-node', objectKind: 'node' })).toBe(true);
        expect(focus.getTargetSnapshot()).toEqual({ objectId: 'new-node', objectKind: 'node' });
        expect(focus.getFocusSnapshot('node', 'new-node')).toBe(true);
        expect(focus.complete({ objectId: 'other-node', objectKind: 'node' })).toBe(false);
        expect(focus.complete({ objectId: 'new-node', objectKind: 'edge' })).toBe(false);
        expect(focus.getTargetSnapshot()).toEqual({ objectId: 'new-node', objectKind: 'node' });

        expect(focus.complete({ objectId: 'new-node', objectKind: 'node' })).toBe(true);
        expect(focus.getTargetSnapshot()).toBeNull();
        expect(nodeChanged).toHaveBeenCalledTimes(2);
    });

    it('replaces an older target and notifies only both affected object subscriptions', () => {
        const focus = new DiagramLabelFocusService(new DiagramSessionStub());
        const firstChanged = vi.fn();
        const secondChanged = vi.fn();
        const unrelatedChanged = vi.fn();
        focus.subscribeFocus('node', 'first', firstChanged);
        focus.subscribeFocus('edge', 'second', secondChanged);
        focus.subscribeFocus('node', 'unrelated', unrelatedChanged);

        focus.request({ objectId: 'first', objectKind: 'node' });
        focus.request({ objectId: 'second', objectKind: 'edge' });

        expect(focus.getTargetSnapshot()).toEqual({ objectId: 'second', objectKind: 'edge' });
        expect(firstChanged).toHaveBeenCalledTimes(2);
        expect(secondChanged).toHaveBeenCalledOnce();
        expect(unrelatedChanged).not.toHaveBeenCalled();
    });

    it('clears a pending request when the edit session changes', () => {
        const session = new DiagramSessionStub();
        const focus = new DiagramLabelFocusService(session);
        const targetChanged = vi.fn();
        focus.subscribeTarget(targetChanged);
        focus.request({ objectId: 'new-edge', objectKind: 'edge' });

        session.changeSession();

        expect(focus.getTargetSnapshot()).toBeNull();
        expect(targetChanged).toHaveBeenCalledTimes(2);
    });
});
