import type { DiagramCollectionKind, DiagramMembershipChangeDetail } from './diagram_edit_types';
import {
    diagramCollectionMembershipChangedEvent,
    diagramFragmentRegionMembershipChangedEvent,
    diagramGroupMembershipChangedEvent,
} from './diagram_edit_events';

export interface PendingMembershipEvent {
    detail: DiagramMembershipChangeDetail;
    eventName: string;
}

export function collectionMembershipEvent(
    memberKind: DiagramCollectionKind,
    addedIds: readonly string[],
    removedIds: readonly string[],
): PendingMembershipEvent {
    return {
        detail: { addedIds, memberKind, ownerId: null, regionIndex: null, removedIds },
        eventName: diagramCollectionMembershipChangedEvent(memberKind),
    };
}

export function groupMembershipEvent(
    groupId: string,
    addedIds: readonly string[],
    removedIds: readonly string[],
): PendingMembershipEvent {
    return {
        detail: { addedIds, memberKind: 'node', ownerId: groupId, regionIndex: null, removedIds },
        eventName: diagramGroupMembershipChangedEvent(groupId),
    };
}

export function fragmentRegionMembershipEvent(
    fragmentId: string,
    regionIndex: number,
    addedIds: readonly string[],
    removedIds: readonly string[],
): PendingMembershipEvent {
    return {
        detail: { addedIds, memberKind: 'edge', ownerId: fragmentId, regionIndex, removedIds },
        eventName: diagramFragmentRegionMembershipChangedEvent(fragmentId, regionIndex),
    };
}
