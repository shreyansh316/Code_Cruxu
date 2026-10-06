import { assertEntityId } from '../shared/identifiers';

const MAX_RETENTION_DAYS = 3650;
const MAX_BATCH_SIZE = 1000;
const TABLES = Object.freeze({
    memory: 'memories',
    usage: 'ai_usages',
    audit: 'audit_logs',
    debugging: 'debugging_sessions',
});

/** Run one bounded, atomic retention batch and preserve its counts in immutable storage. */
export function runDataRetention({ database, policy, now = new Date(), idFactory, batchSize = 250 }) {
    if (!database || typeof database.prepare !== 'function' || typeof database.transaction !== 'function') {
        throw new TypeError('Data retention requires a SQLite database.');
    }
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new TypeError('Retention policy is required.');
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Retention time must be a valid Date.');
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
        throw new TypeError(`Retention batch size must be between 1 and ${MAX_BATCH_SIZE}.`);
    }
    if (typeof idFactory !== 'function') throw new TypeError('Retention requires an id factory.');

    const cutoffDays = Object.fromEntries(Object.keys(TABLES).map((key) => [key, validateDays(policy[key])]));
    const cutoffAt = now.toISOString();
    const runId = assertEntityId(idFactory(), 'Retention run id');
    const execute = database.transaction(() => {
        database.prepare('UPDATE retention_state SET active = 1 WHERE id = 1').run();
        const deleted = {};
        for (const [key, table] of Object.entries(TABLES)) {
            const days = cutoffDays[key];
            if (days === null && key !== 'memory') {
                deleted[key] = 0;
                continue;
            }
            const conditions = [];
            const parameters = [];
            if (days !== null) {
                conditions.push('created_at < ?');
                parameters.push(new Date(now.getTime() - days * 86_400_000).toISOString());
            }
            if (key === 'memory') {
                conditions.push('(expires_at IS NOT NULL AND expires_at <= ?)');
                parameters.push(cutoffAt);
                conditions.push('(invalidated_at IS NOT NULL AND invalidated_at <= ?)');
                parameters.push(cutoffAt);
            }
            parameters.push(batchSize);
            deleted[key] = database.prepare(`
              DELETE FROM ${table} WHERE rowid IN (
                SELECT rowid FROM ${table} WHERE ${conditions.join(' OR ')} ORDER BY created_at, rowid LIMIT ?
              )
            `).run(...parameters).changes;
        }
        database.prepare(`
          INSERT INTO retention_runs (id, cutoff_at, memory_deleted, usage_deleted, audit_deleted, debugging_deleted)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(runId, cutoffAt, deleted.memory, deleted.usage, deleted.audit, deleted.debugging);
        database.prepare('UPDATE retention_state SET active = 0 WHERE id = 1').run();
        return Object.freeze({ id: runId, cutoffAt, deleted: Object.freeze(deleted) });
    });
    return execute();
}

function validateDays(value) {
    if (value === null || value === undefined) return null;
    if (!Number.isInteger(value) || value < 1 || value > MAX_RETENTION_DAYS) {
        throw new TypeError(`Retention days must be null or an integer from 1 to ${MAX_RETENTION_DAYS}.`);
    }
    return value;
}
