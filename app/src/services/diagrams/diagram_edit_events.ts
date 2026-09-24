import type {
    DiagramCollectionKind,
    DiagramConnectionEndpoint,
    DiagramChangeField,
} from './diagram_edit_types';
import type {
    DiagramConnectionPoint,
    DiagramEntityField,
    DiagramLegendEntryData,
    DiagramMeta,
    DiagramSequenceFragmentRegion,
} from './diagram_data';
import type { DiagramFormattingCategory, DiagramScaleField } from './diagram_formatting';

export function eventScope(value: string) {
    return encodeURIComponent(value)
}

export function diagramMetadataFieldChangedEvent(field: keyof DiagramMeta) {
    return `diagram:meta:diagram:${field}`
}

export function diagramObjectFieldChangedEvent(
    objectKind: DiagramCollectionKind,
    objectId: string,
    field: string,
) {
    return `diagram:${objectKind}:${eventScope(objectId)}:${field}`
}

export function diagramEntityFieldChangedEvent(nodeId: string, fieldIndex: number, field: keyof DiagramEntityField) {
    return `diagram:entityField:${eventScope(nodeId)}:${fieldIndex}:${field}`
}

export function diagramEntityFieldMembershipChangedEvent(nodeId: string) {
    return `diagram:entityField:${eventScope(nodeId)}:membership`
}

export function diagramConnectionPointFieldChangedEvent(
    edgeId: string,
    endpoint: DiagramConnectionEndpoint,
    field: keyof DiagramConnectionPoint,
) {
    return `diagram:connectionPoint:${eventScope(edgeId)}:${endpoint}:${field}`
}

export function diagramLegendMembershipChangedEvent() {
    return 'diagram:legendEntry:membership'
}

export function diagramLegendEntryFieldChangedEvent(entryKey: string, field: keyof DiagramLegendEntryData | 'order') {
    return `diagram:legendEntry:${eventScope(entryKey)}:${field}`
}

export function diagramCollectionMembershipChangedEvent(objectKind: DiagramCollectionKind) {
    return `diagram:${objectKind}:membership`
}

export function diagramCollectionMembershipWillChangeEvent(objectKind: DiagramCollectionKind) {
    return `diagram:${objectKind}:membership:willChange`
}

export function diagramFormattingCategoryChangedEvent(category: DiagramFormattingCategory, value: string) {
    return `diagram:formatting:${category}:${eventScope(value)}`
}

export function diagramFormattingScaleChangedEvent(field: DiagramScaleField) {
    return `diagram:formatting:scale:${field}`
}

export function diagramGroupMembershipChangedEvent(groupId: string) {
    return `diagram:group:${eventScope(groupId)}:nodeIds`
}

export function diagramFragmentRegionMembershipChangedEvent(fragmentId: string, regionIndex: number) {
    return `diagram:fragment:${eventScope(fragmentId)}:regions:${regionIndex}:edgeIds`
}

export function diagramFragmentRegionFieldChangedEvent(
    fragmentId: string,
    regionIndex: number,
    field: keyof DiagramSequenceFragmentRegion,
) {
    return `diagram:fragment:${eventScope(fragmentId)}:regions:${regionIndex}:${field}`
}

export function diagramChangeFieldChangedEvent(changeId: string, field: DiagramChangeField) {
    return `diagram:change:${eventScope(changeId)}:${field}`
}

