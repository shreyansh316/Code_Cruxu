import { assertEntityId } from '../../shared/identifiers';
import { redactSecrets } from '../../shared/redactSecrets';

const MAX_AUDIT_QUERY_LIMIT = 1000;
const MAX_AUDIT_DETAILS_BYTES = 64 * 1024;

/** Append-only audit persistence with parameterized, bounded read queries. */
export class AuditLogRepository {
    constructor(database) {
        if (!database || typeof database.prepare !== 'function') {
            throw new TypeError('AuditLogRepository requires a SQLite database handle.');
        }
        this.database = database;
    }

    append({ id, action, entity, entityId, actorId = null, taskId = null, details = {} }) {
        id = assertEntityId(id, 'Audit id');
        entityId = assertEntityId(entityId, 'Audit entity id');
        if (typeof action !== 'string' || action.trim() === '' || typeof entity !== 'string' || entity.trim() === '') {
            throw new TypeError('Audit action and entity must be non-empty strings.');
        }
        if (actorId !== null) actorId = assertEntityId(actorId, 'Audit actor id');
        if (taskId !== null) taskId = assertEntityId(taskId, 'Audit task id');
        let serializedDetails;
        try {
            serializedDetails = JSON.stringify(details);
        }
        catch {
            throw new TypeError('Audit details must be JSON serializable.');
        }
        if (serializedDetails === undefined) {
            throw new TypeError('Audit details must be JSON serializable.');
        }
        if (Buffer.byteLength(serializedDetails, 'utf8') > MAX_AUDIT_DETAILS_BYTES) {
            throw new TypeError(`Audit details cannot exceed ${MAX_AUDIT_DETAILS_BYTES} bytes.`);
        }
        serializedDetails = JSON.stringify(sanitizeAuditValue(JSON.parse(serializedDetails)));
        if (Buffer.byteLength(serializedDetails, 'utf8') > MAX_AUDIT_DETAILS_BYTES) {
            throw new TypeError(`Sanitized audit details cannot exceed ${MAX_AUDIT_DETAILS_BYTES} bytes.`);
        }
        this.database.prepare(`
          INSERT INTO audit_logs (id, action, entity, entity_id, agent_id, task_id, details)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, action.trim(), entity.trim(), entityId, actorId, taskId, serializedDetails);
        return this.getById(id);
    }

    getById(id) {
        id = assertEntityId(id, 'Audit id');
        return mapAudit(this.database.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id));
    }

    listRecent({ limit = 100 } = {}) {
        validateLimit(limit);
        return this.database.prepare(`
          SELECT * FROM audit_logs ORDER BY created_at DESC, rowid DESC LIMIT ?
        `).all(limit).map(mapAudit);
    }

    listByEntity(entity, entityId, { limit = 100 } = {}) {
        if (typeof entity !== 'string' || entity.trim() === '') throw new TypeError('Audit entity must be non-empty.');
        entityId = assertEntityId(entityId, 'Audit entity id');
        validateLimit(limit);
        return this.database.prepare(`
          SELECT * FROM audit_logs WHERE entity = ? AND entity_id = ?
          ORDER BY created_at, rowid LIMIT ?
        `).all(entity.trim(), entityId, limit).map(mapAudit);
    }

    listByTask(taskId, { limit = 100 } = {}) {
        taskId = assertEntityId(taskId, 'Audit task id');
        validateLimit(limit);
        return this.database.prepare(`
          SELECT * FROM audit_logs WHERE task_id = ? ORDER BY created_at, rowid LIMIT ?
        `).all(taskId, limit).map(mapAudit);
    }

    hasTaskReviewDecision(taskId, evidenceHash) {
        taskId = assertEntityId(taskId, 'Review task id');
        if (typeof evidenceHash !== 'string' || !/^[a-f0-9]{64}$/.test(evidenceHash)) {
            throw new TypeError('Review evidence hash must be a SHA-256 digest.');
        }
        return Boolean(this.database.prepare(`
          SELECT 1 FROM audit_logs WHERE task_id = ?
            AND action IN ('CODE_CHANGES_APPROVED', 'CODE_CHANGES_REJECTED')
            AND json_extract(details, '$.evidenceHash') = ? LIMIT 1
        `).get(taskId, evidenceHash));
    }

    hasEntityAction(entity, entityId, action) {
        if (typeof entity !== 'string' || !entity.trim() || typeof action !== 'string' || !action.trim()) {
            throw new TypeError('Audit entity and action must be non-empty strings.');
        }
        entityId = assertEntityId(entityId, 'Audit entity id');
        return Boolean(this.database.prepare('SELECT 1 FROM audit_logs WHERE entity = ? AND entity_id = ? AND action = ? LIMIT 1')
            .get(entity.trim(), entityId, action.trim()));
    }
}

function sanitizeAuditValue(value) {
    if (typeof value === 'string') return redactSecrets(value, MAX_AUDIT_DETAILS_BYTES);
    if (Array.isArray(value)) return value.map(sanitizeAuditValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
            const safeKey = redactSecrets(key, 256);
            const safeValue = /(?:api[_-]?key|authorization|bearer|token|password|secret|access[_-]?key|private[_-]?key)/i.test(key)
                ? '[redacted]' : sanitizeAuditValue(entry);
            return [safeKey, safeValue];
        }));
    }
    return value;
}

function validateLimit(limit) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_AUDIT_QUERY_LIMIT) {
        throw new TypeError(`Audit query limit must be between 1 and ${MAX_AUDIT_QUERY_LIMIT}.`);
    }
}

function mapAudit(row) {
    if (!row) return undefined;
    let details;
    try {
        details = sanitizeAuditValue(JSON.parse(row.details ?? 'null'));
    }
    catch {
        details = null;
    }
    return {
        id: row.id, action: row.action, entity: row.entity, entityId: row.entity_id,
        actorId: row.agent_id, taskId: row.task_id, details, createdAt: row.created_at,
    };
}
