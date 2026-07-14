export interface ActionDefinitionValidationParityCase {
    expected: {
        code: string
        field: string | null
        fieldPath: string | null
        index: number | null
    }
    files: { content: string, path: string }[]
    name: string
}

export const ACTION_DEFINITION_VALIDATION_PARITY_CASES: ActionDefinitionValidationParityCase[]
