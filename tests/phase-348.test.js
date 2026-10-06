/** Phase 348 — persist CEO-approved task tool grants before scheduling. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTaskToolPermissionManagement } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { createSqliteUnitOfWork } from '../src/infrastructure';
import { AgentRepository, AuditLogRepository, ExecutionQueueRepository, ObjectiveRepository,
    OrganizationRepository, ProjectRepository, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

const permissions = { readFiles: ['src/index.js'], writeFiles: ['src/generated.js'],
    commands: [{ command: 'npm', args: ['test', '--', 'tests/smoke.test.js'] }] };

describe('Phase 348 — persisted task tool permissions', () => {
    let connection; let database; let agents; let tasks; let queue; let audits; let workflow;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'organization-348', name: 'Org' });
        agents = new AgentRepository(database);
        agents.create({ id: 'ceo-348', name: 'CEO', role: AgentRole.CEO, organizationId: 'organization-348' });
        agents.create({ id: 'other-348', name: 'Other', role: AgentRole.DIRECTOR, organizationId: 'organization-348' });
        const objectives = new ObjectiveRepository(database);
        objectives.create({ id: 'objective-348', organizationId: 'organization-348', title: 'Objective', description: 'Work' });
        const projects = new ProjectRepository(database);
        projects.create({ id: 'project-348', objectiveId: 'objective-348', name: 'Project' });
        tasks = new TaskRepository(database);
        tasks.create({ id: 'task-348', taskCode: 'PH348-001', title: 'Implement feature',
            projectId: 'project-348', creatorId: 'other-348', assigneeId: 'other-348', status: TaskStatus.ASSIGNED });
        queue = new ExecutionQueueRepository(database); audits = new AuditLogRepository(database);
        let id = 0;
        workflow = createTaskToolPermissionManagement({ taskRepository: tasks, projectRepository: projects,
            objectiveRepository: objectives, agentRepository: agents,
            hierarchyProvider: { getSnapshot: () => ({ organization: { id: 'organization-348' }, agents: agents.list() }) },
            queueRepository: queue, auditRepository: audits, unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => new Date('2026-10-06T00:00:00.000Z') }, idFactory: () => `audit-348-${++id}` });
    });
    afterEach(() => connection.close());

    it('stores a normalized manifest and records counts without exposing paths or commands in audit details', async () => {
        const result = await workflow.run({ taskId: 'task-348', actorId: 'ceo-348', permissions });

        expect(result.ok).toBe(true);
        expect(tasks.getById('task-348').toolPermissions).toEqual(permissions);
        expect(Object.isFrozen(tasks.getById('task-348').toolPermissions)).toBe(true);
        expect(audits.listByEntity('task', 'task-348')).toMatchObject([{
            action: 'TASK_TOOL_PERMISSIONS_CONFIGURED', actorId: 'ceo-348',
            details: { readFileCount: 1, writeFileCount: 1, commandCount: 1 },
        }]);
        expect(JSON.stringify(audits.listByEntity('task', 'task-348'))).not.toContain('src/index.js');
    });

    it('rejects non-CEO grant attempts without changing task permissions', async () => {
        const result = await workflow.run({ taskId: 'task-348', actorId: 'other-348', permissions });

        expect(result.error.code).toBe('task-tool-permission-forbidden');
        expect(tasks.getById('task-348').toolPermissions).toBeNull();
        expect(audits.listByEntity('task', 'task-348')).toEqual([]);
    });

    it('freezes grants once an execution queue entry exists', async () => {
        expect((await workflow.run({ taskId: 'task-348', actorId: 'ceo-348', permissions })).ok).toBe(true);
        queue.enqueue({ id: 'queue-348', taskId: 'task-348' });

        const result = await workflow.run({ taskId: 'task-348', actorId: 'ceo-348', permissions: { readFiles: [], writeFiles: [], commands: [] } });

        expect(result.error.code).toBe('task-tool-permission-frozen');
        expect(tasks.getById('task-348').toolPermissions).toEqual(permissions);
        expect(() => database.prepare('UPDATE tasks SET tool_permissions_json = ? WHERE id = ?')
            .run(JSON.stringify({ readFiles: [], writeFiles: [], commands: [] }), 'task-348'))
            .toThrow(/immutable after queueing/);
    });

    it.each([
        { readFiles: ['../secret.txt'], writeFiles: [], commands: [] },
        { readFiles: ['C:\\secret.txt'], writeFiles: [], commands: [] },
        { readFiles: [], writeFiles: [], commands: [{ command: 'cmd.exe.', args: ['/c', 'whoami'] }] },
        { readFiles: [], writeFiles: [], commands: [{ command: 'npm', args: 'test' }] },
    ])('rejects malformed or unsafe grants before persistence (%j)', async (value) => {
        const result = await workflow.run({ taskId: 'task-348', actorId: 'ceo-348', permissions: value });

        expect(result.ok).toBe(false);
        expect(tasks.getById('task-348').toolPermissions).toBeNull();
    });

    it('rolls back the grant when its audit record cannot be written', async () => {
        const failing = createTaskToolPermissionManagement({ taskRepository: tasks,
            projectRepository: { getById: () => ({ objectiveId: 'objective-348' }) },
            objectiveRepository: { getById: () => ({ organizationId: 'organization-348' }) },
            agentRepository: agents,
            hierarchyProvider: { getSnapshot: () => ({ organization: { id: 'organization-348' }, agents: agents.list() }) },
            queueRepository: queue, auditRepository: { append: vi.fn(() => { throw new Error('audit failed'); }) },
            unitOfWork: createSqliteUnitOfWork(database), clock: { now: () => new Date() }, idFactory: () => 'audit-fail-348' });

        expect((await failing.run({ taskId: 'task-348', actorId: 'ceo-348', permissions })).ok).toBe(false);
        expect(tasks.getById('task-348').toolPermissions).toBeNull();
    });
});
