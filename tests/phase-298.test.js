/** Phase 298 — protect reads of legacy audit rows predating write sanitation. */
import { afterEach, describe, expect, it } from 'vitest';
import { AuditLogRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 298 — legacy audit detail sanitation', () => {
    let connection;
    afterEach(() => connection?.close());

    it('redacts legacy values returned by repository read methods', () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        database.prepare(`INSERT INTO audit_logs (id, action, entity, entity_id, details)
            VALUES (?, ?, ?, ?, ?)`)
            .run('legacy-audit', 'LEGACY', 'task', 'legacy-task', JSON.stringify({ token: 'historic-secret-value' }));

        const audit = new AuditLogRepository(database);
        const record = audit.getById('legacy-audit');
        expect(record.details.token).toBe('[redacted]');
        expect(JSON.stringify(audit.listRecent())).not.toContain('historic-secret-value');
    });
});
