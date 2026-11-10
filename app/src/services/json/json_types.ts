export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonLocationSegment = number | string;

export function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJsonPrimitive(value: JsonValue): value is JsonPrimitive {
    return value === null || typeof value !== 'object';
}
