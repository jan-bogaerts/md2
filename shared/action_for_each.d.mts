import type { ActionForEachConfig, JsonValue } from '../app/src/data/action_run_types.ts'

export const FOR_EACH_MODES: ReadonlySet<ActionForEachConfig['mode']>
export const FOR_EACH_FAILURE_POLICIES: ReadonlySet<ActionForEachConfig['failurePolicy']>
export function validateForEachConfig(value: unknown, fieldName?: string): ActionForEachConfig
export function forEachRecords(value: JsonValue): JsonValue[]
export function resolveDataPlaceholders(text: string, record: JsonValue): string
