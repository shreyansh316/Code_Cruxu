import { describe, expect, it } from 'vitest';
import { SqliteConnection, applyMigrations, SCHEMA_MIGRATIONS } from '../src/storage';

describe('Phase 080 — SQLite query performance tuning', () => {
    it('adds versioned partial indexes used by owner and attribution query plans', () => {
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database, SCHEMA_MIGRATIONS.slice(0, -1));
        expect(database.prepare('SELECT max(version) AS version FROM schema_migrations').get().version)
            .toBe(SCHEMA_MIGRATIONS.at(-1).version - 1);
        applyMigrations(database);

        const ownerIndexes = [
            ['organization_id', 'organization'], ['office_id', 'office'], ['department_id', 'department'],
            ['task_id', 'task'], ['project_id', 'project'], ['objective_id', 'objective'],
        ];
        for (const [column, index] of ownerIndexes) {
            const plan = database.prepare(`EXPLAIN QUERY PLAN SELECT id FROM memories
              WHERE scope = ? AND ${column} = ? ORDER BY created_at, id LIMIT ?`).all('CEO', 'owner-080', 100);
            expect(plan.map((entry) => entry.detail).join(' ')).toContain(`idx_memories_owner_${index}`);
        }
        for (const [table, column, index] of [
            ['ai_usages', 'agent_id', 'idx_ai_usages_agent_created'],
            ['audit_logs', 'task_id', 'idx_audit_task_created'],
        ]) {
            const plan = database.prepare(`EXPLAIN QUERY PLAN SELECT * FROM ${table}
              WHERE ${column} = ? ORDER BY created_at, rowid LIMIT ?`).all('owner-080', 100);
            expect(plan.map((entry) => entry.detail).join(' ')).toContain(index);
        }

        const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(({ name }) => name);
        expect(indexes).toContain('idx_memories_owner_objective');
        connection.close();
    });

    it('leaves unrelated and unowned rows outside the new partial indexes', () => {
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const indexes = database.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index'").all();
        for (const { name, sql } of indexes.filter(({ name }) => name.startsWith('idx_memories_owner_')
            || name === 'idx_ai_usages_agent_created' || name === 'idx_audit_task_created')) {
            expect(sql).toMatch(/WHERE .* IS NOT NULL/i);
        }
        expect(() => database.prepare('SELECT * FROM memories WHERE scope = ? AND organization_id = ?')
            .all('CEO', 'missing-owner')).not.toThrow();
        connection.close();
    });
});
