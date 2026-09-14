import {
    DIAGRAM_FORMATTING_SCALE_MAXIMUM,
    DIAGRAM_FORMATTING_SCALE_MINIMUM,
    parseDiagramData,
    type DiagramConnectionKindFormatting,
    type DiagramData,
    type DiagramEdgeKind,
    type DiagramFormatting,
    type DiagramNodeRoleFormatting,
    type DiagramRole,
} from './diagram_data'

export const DIAGRAM_FORMATTING_SCALE_DEFAULT = 100
export const DIAGRAM_FORMATTING_SCALE_STEP = 10
export type DiagramScaleField = 'boxScalePercent' | 'fontScalePercent' | 'spacingScalePercent'
export type DiagramFormattingCategory = 'connectionKind' | 'nodeRole'

export function diagramScale(formatting: DiagramFormatting | undefined, field: DiagramScaleField) {
    return formatting?.[field] ?? DIAGRAM_FORMATTING_SCALE_DEFAULT
}

export function validateDiagramScale(value: number, field: DiagramScaleField) {
    if (!Number.isFinite(value) || value < DIAGRAM_FORMATTING_SCALE_MINIMUM || value > DIAGRAM_FORMATTING_SCALE_MAXIMUM) {
        throw new Error(
            `Malformed diagram data: formatting.${field} has number outside the `
            + `${DIAGRAM_FORMATTING_SCALE_MINIMUM}..${DIAGRAM_FORMATTING_SCALE_MAXIMUM} range`,
        )
    }
}

/** Validates formatting through shared parser and returns its canonical owned value. */
export function canonicalFormatting(diagram: DiagramData, formatting: DiagramFormatting): DiagramFormatting {
    const canonical = parseDiagramData(JSON.stringify({ ...diagram, formatting })).formatting
    if (!canonical) throw new Error('Malformed diagram data: formatting has invalid value')

    return canonical
}

export function withDiagramScale(
    diagram: DiagramData,
    field: DiagramScaleField,
    value: number,
) {
    validateDiagramScale(value, field)

    return canonicalFormatting(diagram, { ...diagram.formatting, [field]: value })
}

export function withNodeRoleFormatting(
    diagram: DiagramData,
    role: DiagramRole,
    value: DiagramNodeRoleFormatting,
) {
    return canonicalFormatting(diagram, {
        ...diagram.formatting,
        nodeRoles: { ...diagram.formatting?.nodeRoles, [role]: value },
    })
}

export function withConnectionKindFormatting(
    diagram: DiagramData,
    kind: DiagramEdgeKind,
    value: DiagramConnectionKindFormatting,
) {
    return canonicalFormatting(diagram, {
        ...diagram.formatting,
        connectionKinds: { ...diagram.formatting?.connectionKinds, [kind]: value },
    })
}

export function sameFormattingValue(left: unknown, right: unknown) {
    return JSON.stringify(left) === JSON.stringify(right)
}
