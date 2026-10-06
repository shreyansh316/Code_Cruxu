/** Phase 393 — debugging evidence cannot claim an impossible tool action. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createControlledDebuggingWorkflow } from '../src/application';
import { AgentRepository, AuditLogRepository, DebuggingSessionRepository, OrganizationRepository, ProjectRepository,
    ObjectiveRepository, TaskRepository, SqliteConnection, applyMigrations } from '../src/storage';
import { createSqliteUnitOfWork, SqliteEventBus } from '../src/infrastructure';

describe('Phase 393 — debugging action attribution integrity', () => {
    let connection; let database; let sessions; let workflow; let counter;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-393', name: 'Org' });
        new ObjectiveRepository(database).create({ id: 'objective-393', organizationId: 'org-393', title: 'Objective', description: 'Work' });
        new ProjectRepository(database).create({ id: 'project-393', objectiveId: 'objective-393', name: 'Project', description: 'Work' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)').run('office-393', 'org-393', 'Office', 'office-393');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)').run('department-393', 'office-393', 'Department', 'department-393');
        new AgentRepository(database).create({ id: 'employee-393', name: 'Employee', role: 'EMPLOYEE', departmentId: 'department-393' });
        new TaskRepository(database).create({ id: 'task-393', taskCode: 'PH393-001', title: 'Fix issue', projectId: 'project-393', assigneeId: 'employee-393', status: 'IN_PROGRESS' });
        sessions = new DebuggingSessionRepository(database); counter = 0;
        workflow = createControlledDebuggingWorkflow({ sessionRepository: sessions,
            taskRepository: new TaskRepository(database), agentRepository: new AgentRepository(database),
            auditRepository: new AuditLogRepository(database), eventPublisher: new SqliteEventBus(database),
            unitOfWork: createSqliteUnitOfWork(database), authorize: () => true,
            clock: { now: () => '2026-10-06T12:00:00.000Z' }, idFactory: () => `phase393-${++counter}` });
    });
    afterEach(() => connection.close());

    it('rejects write attribution during reproduction without persisting the step', async () => {
        const started = await workflow.start.run({ taskId: 'task-393', actorId: 'employee-393', actorRole: 'EMPLOYEE', confirm: true });
        const result = await workflow.recordStep.run({ sessionId: started.value.id, actorId: 'employee-393', actorRole: 'EMPLOYEE',
            stage: 'REPRODUCE', outcome: 'PASS', summary: 'Wrote file', files: ['src/main.js'], toolAction: 'WRITE_FILE' });
        expect(result.ok).toBe(false);
        expect(sessions.listSteps(started.value.id)).toEqual([]);
    });

    it('requires a non-empty command summary and count for command execution attribution', async () => {
        const started = await workflow.start.run({ taskId: 'task-393', actorId: 'employee-393', actorRole: 'EMPLOYEE', confirm: true });
        const result = await workflow.recordStep.run({ sessionId: started.value.id, actorId: 'employee-393', actorRole: 'EMPLOYEE',
            stage: 'REPRODUCE', outcome: 'PASS', summary: 'Command ran', commandsRun: 1,
            toolAction: 'EXECUTE_COMMAND' });
        expect(result.ok).toBe(false);
        expect(sessions.listSteps(started.value.id)).toEqual([]);
    });

    it('redacts command credentials from immutable debugging steps and their audit copy', async () => {
        const started = await workflow.start.run({ taskId: 'task-393', actorId: 'employee-393', actorRole: 'EMPLOYEE', confirm: true });
        const auditRepository = new AuditLogRepository(database);
        workflow = createControlledDebuggingWorkflow({ sessionRepository: sessions,
            taskRepository: new TaskRepository(database), agentRepository: new AgentRepository(database),
            auditRepository, eventPublisher: new SqliteEventBus(database), unitOfWork: createSqliteUnitOfWork(database),
            authorize: () => true, clock: { now: () => '2026-10-06T12:00:00.000Z' }, idFactory: () => `phase393-${++counter}` });
        const result = await workflow.recordStep.run({ sessionId: started.value.id, actorId: 'employee-393', actorRole: 'EMPLOYEE',
            stage: 'REPRODUCE', outcome: 'PASS', summary: 'Reproduced safely', files: [], commandsRun: 1,
            toolAction: 'EXECUTE_COMMAND', commandSummary: 'npm test token=debug-secret' });
        expect(result.ok, result.error?.message).toBe(true);
        expect(sessions.listSteps(started.value.id)[0].commandSummary).toBe('npm test token=[redacted]');
        const detail = database.prepare("SELECT details FROM audit_logs WHERE action = 'DEBUGGING_STEP_RECORDED'").get().details;
        expect(detail).toContain('npm test token=[redacted]');
        expect(detail).not.toContain('debug-secret');
    });
});
