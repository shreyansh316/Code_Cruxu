import { afterEach, describe, expect, it } from 'vitest';
import { AgentRepository, DepartmentRepository, ObjectiveRepository, OfficeRepository, SCHEMA_MIGRATIONS, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 125 — organization ownership for executives and objectives', () => {
    let connection;
    afterEach(() => connection?.close());

    it('round-trips organization ownership for executives and objectives', () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        database.prepare("INSERT INTO organizations (id, name) VALUES ('org-125', 'Organization')").run();
        database.prepare("INSERT INTO organizations (id, name) VALUES ('org-125-other', 'Other Organization')").run();
        new OfficeRepository(database).create({ id: 'office-125', organizationId: 'org-125', name: 'Office', slug: 'office-125' });
        new DepartmentRepository(database).create({ id: 'department-125', officeId: 'office-125', name: 'Department', slug: 'department-125' });

        const agents = new AgentRepository(database);
        const objectives = new ObjectiveRepository(database);
        agents.create({ id: 'director-125', organizationId: 'org-125', name: 'Director', role: 'DIRECTOR', status: 'IDLE' });
        agents.create({ id: 'director-125-other', organizationId: 'org-125-other', name: 'Other Director', role: 'DIRECTOR', status: 'IDLE' });
        agents.create({ id: 'head-125', name: 'Head', role: 'HEAD_MANAGER', managedOfficeId: 'office-125' });
        agents.create({ id: 'manager-125', name: 'Manager', role: 'DEPT_MANAGER', managedDepartmentId: 'department-125' });
        agents.create({ id: 'employee-125', name: 'Employee', role: 'EMPLOYEE', departmentId: 'department-125' });
        objectives.create({ id: 'objective-125', organizationId: 'org-125', title: 'Release', description: 'Ship safely' });

        expect(agents.listByRole('DIRECTOR')[0].organizationId).toBe('org-125');
        expect(agents.getById('head-125').organizationId).toBe('org-125');
        expect(agents.getById('manager-125').organizationId).toBe('org-125');
        expect(agents.getById('employee-125').organizationId).toBe('org-125');
        expect(objectives.getById('objective-125').organizationId).toBe('org-125');
        expect(agents.listByOrganization('org-125').map(({ id }) => id)).toEqual(expect.arrayContaining([
            'director-125', 'head-125', 'manager-125', 'employee-125',
        ]));
        expect(agents.listByOrganization('org-125')).toHaveLength(4);
        expect(() => agents.create({ id: 'director-foreign-125', organizationId: 'missing-org',
            name: 'Foreign Director', role: 'DIRECTOR' })).toThrow();
        expect(() => agents.create({ id: 'head-foreign-125', organizationId: 'another-org', name: 'Foreign Head',
            role: 'HEAD_MANAGER', managedOfficeId: 'office-125' })).toThrow(/organization ownership/);
        expect(() => agents.update('head-125', { organizationId: 'org-125-other' })).toThrow(/organization ownership/);
        expect(agents.getById('head-125').organizationId).toBe('org-125');
        expect(() => agents.update('director-125', { organizationId: 'org-125-other' })).toThrow(/cannot be changed after assignment/);
        expect(() => objectives.update('objective-125', { organizationId: 'org-125-other' })).toThrow(/cannot be changed after assignment/);
        expect(objectives.getById('objective-125').organizationId).toBe('org-125');
    });

    it('backfills legacy executive and objective ownership only when the organization is unambiguous', () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database, SCHEMA_MIGRATIONS.slice(0, 10));
        database.prepare("INSERT INTO organizations (id, name) VALUES ('org-125-a', 'A')").run();
        database.prepare("INSERT INTO agents (id, name, role) VALUES ('director-125-a', 'Director', 'DIRECTOR')").run();
        database.prepare("INSERT INTO objectives (id, title, description) VALUES ('objective-125-a', 'Legacy', 'Legacy objective')").run();
        applyMigrations(database);

        expect(new AgentRepository(database).getById('director-125-a').organizationId).toBe('org-125-a');
        expect(new ObjectiveRepository(database).getById('objective-125-a').organizationId).toBe('org-125-a');

        database.prepare("INSERT INTO organizations (id, name) VALUES ('org-125-b', 'B')").run();
        database.prepare("INSERT INTO agents (id, name, role) VALUES ('director-125-b', 'Unscoped legacy director', 'DIRECTOR')").run();
        database.prepare("INSERT INTO objectives (id, title, description) VALUES ('objective-125-unassigned', 'Unassigned', 'Legacy')").run();
        expect(new AgentRepository(database).getById('director-125-b').organizationId).toBeNull();
        const objectives = new ObjectiveRepository(database);
        expect(objectives.listUnassigned().map(({ id }) => id)).toContain('objective-125-unassigned');
        objectives.update('objective-125-unassigned', { organizationId: 'org-125-b' });
        expect(objectives.getById('objective-125-unassigned').organizationId).toBe('org-125-b');
        expect(() => objectives.update('objective-125-unassigned', { organizationId: 'org-125-a' }))
            .toThrow(/cannot be changed after assignment/);
    });
});
