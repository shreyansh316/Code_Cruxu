/** Runtime counterpart to the former branded identifier contracts. */
export function assertEntityId(value, label = 'Entity identifier') {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TypeError(`${label} must be a non-empty string.`);
    }
    return value.trim();
}
