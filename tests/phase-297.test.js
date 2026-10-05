/** Phase 297 — redact and bound arbitrary audit detail values at persistence. */
import { afterEach, describe, expect, it } from 'vitest';
import { AuditLogRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 297 — audit detail sanitation', () => {
    let connection;
    afterEach(() => connection?.close());

    it('redacts nested secrets and credential-bearing keys before storing audit details', () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const audit = new AuditLogRepository(database);
        const record = audit.append({ id: 'audit-297', action: 'REVIEW_RECORDED', entity: 'task', entityId: 'task-297',
            details: { output: 'Bearer audit-secret-value', endpoint: 'https://user:pass-secret@service.example',
                'api_key=key-secret': 'ordinary' } });

        const serialized = JSON.stringify(record.details);
        expect(serialized).not.toMatch(/audit-secret-value|pass-secret|key-secret/);
        expect(record.details.output).toBe('Bearer [redacted]');
        expect(record.details.endpoint).toContain('user:[redacted]@service.example');
        expect(Object.keys(record.details)[2]).toBe('api_key=[redacted]');
    });

    it('rejects audit details above the storage byte ceiling', () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const audit = new AuditLogRepository(database);
        expect(() => audit.append({ id: 'audit-large', action: 'TEST', entity: 'task', entityId: 'task-large',
            details: { payload: 'x'.repeat(65 * 1024) } })).toThrow(/cannot exceed 65536 bytes/);
    });
});
