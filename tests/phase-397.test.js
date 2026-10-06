/** Phase 397 — callers cannot forge an escalation through the ordinary stop operation. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createControlledDebuggingWorkflow } from '../src/application';
import { AgentRepository, AuditLogRepository, DebuggingSessionRepository, OrganizationRepository,
    SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';
import { createSqliteUnitOfWork, SqliteEventBus } from '../src/infrastructure';

describe('Phase 397 — controlled debugging terminal transitions', () => {
    let connection; let database; let sessions; let workflow; let idCount;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-397', name: 'Org' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)').run('office-397', 'org-397', 'Office', 'office-397');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)').run('department-397', 'office-397', 'Department', 'department-397');
        new AgentRepository(database).create({ id: 'employee-397', name: 'Employee', role: 'EMPLOYEE', departmentId: 'department-397' });
        new TaskRepository(database).create({ id: 'task-397', taskCode: 'PH397-001', title: 'Debug carefully', assigneeId: 'employee-397', status: 'IN_PROGRESS' });
        sessions = new DebuggingSessionRepository(database);
        idCount = 0;
        workflow = createControlledDebuggingWorkflow({ sessionRepository: sessions,
            taskRepository: new TaskRepository(database), agentRepository: new AgentRepository(database),
            auditRepository: new AuditLogRepository(database), eventPublisher: new SqliteEventBus(database),
            unitOfWork: createSqliteUnitOfWork(database), authorize: () => true,
            clock: { now: () => '2026-10-06T12:00:00.000Z' }, idFactory: () => `phase-397-id-${++idCount}` });
    });
    afterEach(() => connection.close());

    it('rejects caller-selected ESCALATED status and leaves task/session/event state unchanged', async () => {
        const started = await workflow.start.run({ taskId: 'task-397', actorId: 'employee-397', actorRole: 'EMPLOYEE', confirm: true });
        const result = await workflow.stop.run({ sessionId: started.value.id, actorId: 'employee-397', actorRole: 'EMPLOYEE',
            reason: 'low-confidence', summary: 'Caller wants to raise an escalation.', status: 'ESCALATED' });
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('debugging-stop-status-forbidden');
        expect(sessions.getById(started.value.id).status).toBe('ACTIVE');
        expect(new TaskRepository(database).getById('task-397').status).toBe('IN_PROGRESS');
        expect(database.prepare("SELECT count(*) AS count FROM events WHERE type = 'TASK_ESCALATED'").get().count).toBe(0);
    });

    it('stops only as STOPPED when the task assignee requests a normal stop', async () => {
        const started = await workflow.start.run({ taskId: 'task-397', actorId: 'employee-397', actorRole: 'EMPLOYEE', confirm: true });
        const stopped = await workflow.stop.run({ sessionId: started.value.id, actorId: 'employee-397', actorRole: 'EMPLOYEE',
            reason: 'user-requested', summary: 'End the session.' });
        expect(stopped.ok).toBe(true);
        expect(stopped.value.status).toBe('STOPPED');
        expect(new TaskRepository(database).getById('task-397').status).toBe('IN_PROGRESS');
    });
});
