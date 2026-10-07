/** Phase 436 — persist task tool activity and include its safe projection in execution reports. */
import { afterEach, describe, expect, it } from 'vitest';
import { createTaskExecutionReport } from '../src/application/taskExecutionReport';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { renderCommandCenterHtml } from '../src/core/commandCenterView';
import { AgentRepository, AIUsageRepository, AuditLogRepository, DebuggingSessionRepository,
    OrganizationRepository, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 436 — persisted task tool activity', () => {
    let connection;
    afterEach(() => connection?.close());

    it('records bounded, redacted file and command events with task/employee identity for authorized reports', async () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-436', name: 'Engineering' });
        const agents = new AgentRepository(database);
        agents.create({ id: 'ceo-436', organizationId: 'org-436', name: 'CEO', role: 'CEO' });
        agents.create({ id: 'employee-436', organizationId: 'org-436', name: 'Engineer', role: 'EMPLOYEE' });
        const tasks = new TaskRepository(database);
        tasks.create({ id: 'task-436', taskCode: 'PH436-001', title: 'Run task tools',
            assigneeId: 'employee-436', status: 'IN_PROGRESS' });
        const audit = new AuditLogRepository(database);
        let id = 0;
        const feed = new ExecutionActivityFeed({ auditRepository: audit, idFactory: () => `activity-436-${++id}`,
            clock: () => new Date('2026-10-07T10:00:00.000Z') });
        feed.record('workspace', { operation: 'write', path: 'src/result.js', bytes: 128, succeeded: true },
            { taskId: 'task-436', agentId: 'employee-436' });
        feed.record('command', { event: 'finished', command: 'npm test', exitCode: 0, durationMs: 245,
            stdoutBytes: 18, stderrBytes: 0, outputPreview: 'token=private-value' },
        { taskId: 'task-436', agentId: 'employee-436' });

        const entries = audit.listByTask('task-436');
        expect(entries).toHaveLength(2);
        expect(feed.listRecent().map(({ persisted }) => persisted)).toEqual([true, true]);
        expect(entries[0]).toMatchObject({ action: 'TASK_EXECUTION_ACTIVITY', entity: 'execution-activity',
            actorId: 'employee-436', details: { activitySource: 'workspace', activityAction: 'File written',
                target: 'src/result.js', status: 'SUCCEEDED', bytes: 128 } });
        expect(entries[1].details).toMatchObject({ activitySource: 'command', activityAction: 'Terminal command finished',
            target: 'npm test', status: 'SUCCEEDED', durationMs: 245, detail: 'token=[redacted]' });

        const report = createTaskExecutionReport({ taskRepository: tasks, agentRepository: agents,
            usageRepository: new AIUsageRepository(database), debuggingSessionRepository: new DebuggingSessionRepository(database),
            auditRepository: audit, authorize: ({ actor }) => actor.role === 'CEO' });
        const result = await report.run({ taskId: 'task-436', actorId: 'ceo-436' });
        expect(result.ok).toBe(true);
        expect(result.value.audit.map(({ action, actor, evidence }) => ({ action, actor: actor?.name, evidence })))
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ action: 'TASK_EXECUTION_ACTIVITY', actor: 'Engineer',
                    evidence: expect.objectContaining({ activitySource: 'workspace', target: 'src/result.js', bytes: 128 }) }),
                expect.objectContaining({ action: 'TASK_EXECUTION_ACTIVITY', actor: 'Engineer',
                    evidence: expect.objectContaining({ activitySource: 'command', target: 'npm test', durationMs: 245,
                        detail: 'token=[redacted]' }) }),
            ]));
        expect(JSON.stringify(result.value)).not.toContain('private-value');
    });

    it('keeps activity without persisted task and actor ownership ephemeral', () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:'); applyMigrations(database);
        const audit = new AuditLogRepository(database);
        const feed = new ExecutionActivityFeed({ auditRepository: audit, idFactory: () => 'unused-436' });
        feed.record('workspace', { operation: 'read', path: 'README.md', bytes: 10, succeeded: true }, { taskId: 'task-436' });
        expect(feed.listRecent()).toHaveLength(1);
        expect(feed.listRecent()[0].persisted).toBe(false);
        expect(audit.listRecent()).toEqual([]);
    });

    it('labels database persistence failures while preserving the bounded tool activity', () => {
        const feed = new ExecutionActivityFeed({ auditRepository: { append: () => { throw new Error('disk unavailable'); } },
            idFactory: () => 'activity-436-failed' });
        feed.record('command', { event: 'started', command: 'npm test' },
            { taskId: 'task-436', agentId: 'employee-436' });
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [], executionActivity: feed.listRecent() });
        expect(snapshot.executionActivity[0]).toMatchObject({ activityPersisted: false, agentName: 'Employee identity unavailable' });
        expect(renderCommandCenterHtml()).toContain('Not saved to task report');
    });
});
