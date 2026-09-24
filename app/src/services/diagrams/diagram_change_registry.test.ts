import { describe, expect, it, vi } from 'vitest';
import { CHANGE_IDS_CHANGED_EVENT, DiagramChangeRegistry } from './diagram_change_registry';
import type { DiagramChange } from './diagram_edit_types';
import type { DiagramData } from './diagram_data';

function createChange(id: string, value: string): DiagramChange {
    return {
        category: 'field', field: 'label', id, objectId: id, objectKind: 'node',
        originalValue: 'Original', ownerId: null, regionIndex: null, value,
    };
}

describe('DiagramChangeRegistry', () => {
    it('compares collection changes with the saved baseline and clears them when restored', () => {
        const baseline: DiagramData = {
            nodes: [{ id: 'first', label: 'First', role: 'focal' }],
            edges: [],
            groups: [],
            meta: { title: 'Diagram', description: '', type: 'architecture', version: 1 },
        };
        const current: DiagramData = { ...baseline, nodes: [...baseline.nodes] };
        const registry = new DiagramChangeRegistry();
        registry.setBaseline(baseline);
        registry.setCurrentDiagram(current);

        current.nodes.push({ id: 'second', label: 'Second', role: 'store' });
        registry.markCollectionMembership('node', 'second', true);
        expect(registry.hasChanges).toBe(true);

        current.nodes.pop();
        registry.markCollectionMembership('node', 'second', false);
        expect(registry.hasChanges).toBe(false);
        registry.clearBaseline();
        expect(registry.originalNodes.size).toBe(0);
    });

    it('publishes net change membership before field updates and purges only one owner', () => {
        const registry = new DiagramChangeRegistry();
        const target = new EventTarget();
        const events: string[] = [];
        const idsChanged = vi.fn(() => events.push('ids'));
        const valueChanged = vi.fn(() => events.push('value'));
        target.addEventListener(CHANGE_IDS_CHANGED_EVENT, idsChanged);
        target.addEventListener('change:first:value', valueChanged);
        registry.set(createChange('first', 'One'), 'node:first', false);
        registry.set(createChange('second', 'Two'), 'node:second', false);

        registry.publishPendingEvents(target, (changeId, field) => `change:${changeId}:${field}`);
        expect(registry.ids).toEqual(['first', 'second']);
        expect(events).toEqual(['ids']);

        registry.set(createChange('first', 'Updated'), 'node:first', false);
        registry.purgeOwner('node:second');
        registry.publishPendingEvents(target, (changeId, field) => `change:${changeId}:${field}`);

        expect(registry.ids).toEqual(['first']);
        expect(registry.get('first')?.value).toBe('Updated');
        expect(registry.hasChanges).toBe(true);
        expect(events).toEqual(['ids', 'ids', 'value']);
        expect(idsChanged).toHaveBeenCalledTimes(2);
        expect(valueChanged).toHaveBeenCalledOnce();
    });
});
