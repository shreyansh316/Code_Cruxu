/** Phase 390 — prevent parallel active debugging sessions for one task. */
import { afterEach, describe, expect, it } from 'vitest';
import { createControlledDebuggingWorkflow } from '../src/application';
import { createSqliteUnitOfWork, SqliteEventBus } from '../src/infrastructure';
import { AgentRepository, AuditLogRepository, DebuggingSessionRepository, OrganizationRepository,
    SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 390 — one active debugging session per task', () => {
    let connection;
    afterEach(() => { connection?.close(); connection = undefined; });

    it('rejects a competing session and keeps the original session active', async () => {
        connection = new SqliteConnection(); const database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-390', name: 'Organization' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-390', 'org-390', 'Office', 'office-390');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-390', 'office-390', 'Department', 'department-390');
        new AgentRepository(database).create({ id: 'employee-390', name: 'Employee', role: 'EMPLOYEE', departmentId: 'department-390' });
        new TaskRepository(database).create({ id: 'task-390', taskCode: 'PH390-001', title: 'Debug failure',
            assigneeId: 'employee-390', status: 'IN_PROGRESS' });
        const sessions = new DebuggingSessionRepository(database);
        let id = 0;
        const workflow = createControlledDebuggingWorkflow({ sessionRepository: sessions, taskRepository: new TaskRepository(database),
            agentRepository: new AgentRepository(database), auditRepository: new AuditLogRepository(database),
            eventPublisher: new SqliteEventBus(database), unitOfWork: createSqliteUnitOfWork(database), authorize: () => true,
            clock: { now: () => '2026-10-06T12:00:00.000Z' }, idFactory: () => `debug-390-${++id}` });
        const input = { taskId: 'task-390', actorId: 'employee-390', actorRole: 'EMPLOYEE', confirm: true };
        const first = await workflow.start.run(input);
        const second = await workflow.start.run(input);
        expect(first.ok).toBe(true);
        expect(second).toMatchObject({ ok: false, error: { code: 'debugging-session-already-active' } });
        expect(sessions.hasActiveForTask('task-390')).toBe(true);
        expect(sessions.listByTask('task-390')).toHaveLength(1);
    });
});
