import { afterEach, describe, expect, it } from 'vitest';
import { AgentRepository, SCHEMA_MIGRATIONS, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 117 — persisted employee capabilities', () => {
    let connection;
    afterEach(() => connection?.close());

    it('round-trips bounded capability labels on create and update', () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        database.prepare("INSERT INTO organizations (id, name) VALUES ('org-117', 'Org')").run();
        database.prepare("INSERT INTO offices (id, organization_id, name, slug) VALUES ('office-117', 'org-117', 'Office', 'office')").run();
        database.prepare("INSERT INTO departments (id, office_id, name, slug) VALUES ('dept-117', 'office-117', 'Dept', 'dept')").run();
        const agents = new AgentRepository(database);
        const created = agents.create({ id: 'agent-117', name: 'Build Engineer', role: 'EMPLOYEE',
            departmentId: 'dept-117', specialization: 'Builds', status: 'IDLE', capabilities: ['vite', 'npm'] });

        expect(created.capabilities).toEqual(['vite', 'npm']);
        expect(agents.getById('agent-117').capabilities).toEqual(['vite', 'npm']);
        expect(agents.update('agent-117', { capabilities: ['node', 'vitest'] }).capabilities).toEqual(['node', 'vitest']);
        expect(agents.listByRole('EMPLOYEE')[0].capabilities).toEqual(['node', 'vitest']);
    });

    it('rejects malformed, duplicate, and oversized capability lists before writing', () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const agents = new AgentRepository(database);
        for (const capabilities of [['build', ' BUILD '], [''], Array.from({ length: 33 }, (_, index) => `cap-${index}`)]) {
            expect(() => agents.create({ id: `agent-invalid-${agents.list().length}`, name: 'Engineer', role: 'EMPLOYEE', capabilities }))
                .toThrow(/Agent capabilities/);
        }
        expect(agents.list()).toEqual([]);
    });

    it('upgrades existing agents with an empty capability set and preserves their identity', () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database, SCHEMA_MIGRATIONS.slice(0, 8));
        database.prepare("INSERT INTO agents (id, name, role, status) VALUES ('legacy-117', 'Legacy Agent', 'EMPLOYEE', 'IDLE')").run();
        database.prepare("INSERT INTO tasks (id, task_code, title) VALUES ('legacy-task-117', 'LEGACY-117', 'Legacy task')").run();

        expect(applyMigrations(database)).toBe(SCHEMA_MIGRATIONS.at(-1).version);
        expect(new AgentRepository(database).getById('legacy-117')).toMatchObject({
            id: 'legacy-117', name: 'Legacy Agent', capabilities: [], lifecycleStatus: 'ACTIVE',
        });
        expect(new TaskRepository(database).getById('legacy-task-117').requiredCapabilities).toEqual([]);
    });
});
