/** Normalize clarification text for deterministic exact-duplicate checks. */
export function normalizeQuestionText(value) {
    if (typeof value !== 'string') throw new TypeError('Question text must be a string.');
    return value.normalize('NFKC').toLocaleLowerCase('en-US')
        .replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
