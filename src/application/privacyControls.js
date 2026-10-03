import { assertEntityId } from '../shared/identifiers';

const MAX_TEXT_BYTES = 128 * 1024;
const SECRET_FIELD = /credential|secret|password|api.?key|access.?token/i;
const SENSITIVE_FIELD = /content|description|answer|details|prompt|output|result|memory|file/i;
const INTERNAL_FIELD = /^(id|status|createdAt|updatedAt|scope|role|attempt|durationMs|inputTokens|outputTokens)$/i;

/** Classify fields without inspecting or logging stored values. */
export function classifyStoredData(fieldName) {
    if (typeof fieldName !== 'string' || !fieldName.trim()) throw new TypeError('A data field name is required.');
    if (SECRET_FIELD.test(fieldName)) return 'SECRET';
    if (SENSITIVE_FIELD.test(fieldName)) return 'SENSITIVE';
    if (INTERNAL_FIELD.test(fieldName)) return 'INTERNAL';
    return 'SENSITIVE';
}

/** Redact common credential formats and email addresses from bounded text. */
export function redactSensitiveText(value) {
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_TEXT_BYTES) {
        throw new TypeError(`Redaction input must be text of at most ${MAX_TEXT_BYTES} bytes.`);
    }
    return value
        .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
        .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED_CREDENTIAL]')
        .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_CREDENTIAL]')
        .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[REDACTED_CREDENTIAL]')
        .replace(/\b(api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*(["']?)[^\s,"'}]+/gi, '$1=[REDACTED]')
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]');
}

/** Provide owner-scoped memory export/deletion controls with minimal audit metadata. */
export function createMemoryPrivacyControls({ memoryRepository, auditRepository, unitOfWork, actorId, idFactory } = {}) {
    if (typeof memoryRepository?.getByOwner !== 'function' || typeof memoryRepository?.deleteByOwner !== 'function'
        || typeof auditRepository?.append !== 'function' || typeof unitOfWork?.run !== 'function'
        || typeof idFactory !== 'function') throw new TypeError('Memory privacy controls require scoped storage, audit, and transaction ports.');
    actorId = assertEntityId(actorId, 'Privacy actor id');
    return Object.freeze({
        exportMemory({ scope, ownerId, memoryId } = {}) {
            ownerId = assertEntityId(ownerId, 'Memory owner id');
            memoryId = assertEntityId(memoryId, 'Memory id');
            return unitOfWork.run(() => {
                const memory = memoryRepository.getByOwner(scope, ownerId, memoryId);
                if (!memory) return undefined;
                auditRepository.append({ id: idFactory(), action: 'MEMORY_EXPORTED_FOR_PRIVACY', entity: 'memory', entityId: memoryId,
                    actorId, details: { scope } });
                return Object.freeze({ ...memory });
            });
        },
        deleteMemory({ scope, ownerId, memoryId } = {}) {
            ownerId = assertEntityId(ownerId, 'Memory owner id');
            memoryId = assertEntityId(memoryId, 'Memory id');
            return unitOfWork.run(() => {
                const deleted = memoryRepository.deleteByOwner(scope, ownerId, memoryId);
                if (!deleted) return false;
                auditRepository.append({ id: idFactory(), action: 'MEMORY_DELETED_FOR_PRIVACY', entity: 'memory', entityId: memoryId,
                    actorId, details: { scope } });
                return true;
            });
        },
    });
}
