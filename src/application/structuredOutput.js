import { DomainInvariantError } from '../domain/errors';

const MAX_VALIDATION_DEPTH = 32;
const MAX_SCHEMA_NODES = 4096;

/** Validate bounded JSON model output against the provider-neutral JSON Schema subset. */
export function validateStructuredAIOutput(output, schema, { maxBytes = 128_000 } = {}) {
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 128_000) {
        throw new TypeError('Structured output byte limit is invalid.');
    }
    let serialized;
    try { serialized = JSON.stringify(output); }
    catch { invalid(); }
    if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).byteLength > maxBytes) invalid();
    const budget = { nodes: 0 };
    if (!matchesSchema(output, schema, 0, budget)) invalid();
    try { return deepFreeze(JSON.parse(serialized)); }
    catch { invalid(); }
}

function matchesSchema(value, schema, depth, budget) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)
        || depth > MAX_VALIDATION_DEPTH || ++budget.nodes > MAX_SCHEMA_NODES) return false;
    const type = schema.type ?? inferType(schema);
    if (!matchesType(value, type)) return false;
    if (type === 'object') {
        const keys = Object.keys(value);
        if (Array.isArray(schema.required) && schema.required.some((key) => !Object.hasOwn(value, key))) return false;
        if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(schema.properties ?? {}, key))) return false;
        for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
            if (Object.hasOwn(value, key) && !matchesSchema(value[key], childSchema, depth + 1, budget)) return false;
        }
        return true;
    }
    if (type === 'array') {
        if (schema.minItems !== undefined && value.length < schema.minItems) return false;
        if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
        return !schema.items || value.every((item) => matchesSchema(item, schema.items, depth + 1, budget));
    }
    if (type === 'string') {
        const length = [...value].length;
        return (schema.minLength === undefined || length >= schema.minLength)
            && (schema.maxLength === undefined || length <= schema.maxLength);
    }
    if (type === 'number' || type === 'integer') {
        return Number.isFinite(value) && (type !== 'integer' || Number.isSafeInteger(value))
            && (schema.minimum === undefined || value >= schema.minimum)
            && (schema.maximum === undefined || value <= schema.maximum);
    }
    return true;
}

function inferType(schema) {
    if (schema.properties || schema.required || schema.additionalProperties !== undefined) return 'object';
    if (schema.items || schema.minItems !== undefined || schema.maxItems !== undefined) return 'array';
    if (schema.minLength !== undefined || schema.maxLength !== undefined) return 'string';
    return undefined;
}

function matchesType(value, type) {
    switch (type) {
        case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
        case 'array': return Array.isArray(value);
        case 'string': return typeof value === 'string';
        case 'integer': return Number.isSafeInteger(value);
        case 'number': return typeof value === 'number' && Number.isFinite(value);
        case 'boolean': return typeof value === 'boolean';
        case 'null': return value === null;
        case undefined: return true;
        default: return false;
    }
}

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}

function invalid() {
    throw new DomainInvariantError('invalid-ai-output', 'AI output did not match the bounded structured response contract.');
}
