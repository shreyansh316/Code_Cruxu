import { assertEntityId } from '../../shared/identifiers';

const MAX_AUDIT_QUERY_LIMIT = 1000;

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
        details = JSON.parse(row.details ?? 'null');
    }
    catch {
        details = null;
    }
    return {
        id: row.id, action: row.action, entity: row.entity, entityId: row.entity_id,
        actorId: row.agent_id, taskId: row.task_id, details, createdAt: row.created_at,
    };
}
