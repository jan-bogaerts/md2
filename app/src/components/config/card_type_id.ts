/** Machine-readable card type id derived from the label, since actions match on it and users never type it. */
export function cardTypeIdFromLabel(label: string) {
    return label.trim().toLowerCase().replace(/\s+/gu, '-')
}
