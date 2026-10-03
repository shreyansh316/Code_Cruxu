import { randomUUID } from 'crypto';

const LEVELS = new Set(['DEBUG', 'INFO', 'WARN', 'ERROR']);
const SAFE_CONTEXT_KEYS = new Set([
    'agentId', 'objectiveId', 'taskId', 'status', 'attempt', 'durationMs', 'exitCode',
]);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_CODE = /^[a-z][a-z0-9_.-]{0,63}$/;

/** Create structured, correlated diagnostics that never accept free-form text. */
export function createDiagnosticLogger({ write, now = () => new Date(), correlationId = randomUUID() } = {}) {
    if (typeof write !== 'function' || typeof now !== 'function' || !SAFE_IDENTIFIER.test(correlationId)) {
        throw new TypeError('Diagnostics require a writer, clock, and safe correlation identifier.');
    }
    return Object.freeze({
        forOperation(operation) {
            if (typeof operation !== 'string' || !SAFE_CODE.test(operation)) {
                throw new TypeError('Diagnostic operation must be a stable lowercase code.');
            }
            return Object.freeze({
                correlationId,
                emit(level, code, context = {}) {
                    if (!LEVELS.has(level) || typeof code !== 'string' || !SAFE_CODE.test(code)) {
                        throw new TypeError('Diagnostic level or code is invalid.');
                    }
                    const timestamp = now();
                    const createdAt = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
                    const { safe, omitted } = sanitizeContext(context);
                    const record = Object.freeze({
                        timestamp: createdAt,
                        level,
                        operation,
                        code,
                        correlationId,
                        context: Object.freeze(safe),
                        omittedContextFields: omitted,
                    });
                    write(record);
                    return record;
                },
            });
        },
    });
}

function sanitizeContext(context) {
    if (context === null || typeof context !== 'object' || Array.isArray(context)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(context))) {
        throw new TypeError('Diagnostic context must be a plain object.');
    }
    const safe = {};
    let omitted = 0;
    for (const key of Object.keys(context)) {
        const descriptor = Object.getOwnPropertyDescriptor(context, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
            omitted += 1;
            continue;
        }
        const value = descriptor.value;
        if (!SAFE_CONTEXT_KEYS.has(key)) {
            omitted += 1;
            continue;
        }
        if (['attempt', 'durationMs', 'exitCode'].includes(key)) {
            if (Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000_000) safe[key] = value;
            else omitted += 1;
        }
        else if (key === 'status') {
            if (typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,31}$/.test(value)) safe[key] = value;
            else omitted += 1;
        }
        else if (typeof value === 'string' && SAFE_IDENTIFIER.test(value)) {
            safe[key] = value;
        }
        else omitted += 1;
    }
    return { safe, omitted };
}
