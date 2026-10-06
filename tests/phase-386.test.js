/** Phase 386 — bounded, persistent debugging workflow state and escalation. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createControlledDebuggingWorkflow } from '../src/application';
import { AgentRepository, AuditLogRepository, DebuggingSessionRepository, DirectorQuestionRepository, ObjectiveRepository,
    OrganizationRepository, ProjectRepository, TaskRepository,
    SqliteConnection, applyMigrations } from '../src/storage';
import { createSqliteUnitOfWork, SqliteEventBus } from '../src/infrastructure';

const NOW = '2026-10-06T12:00:00.000Z';
describe('Phase 386 — controlled debugging sessions', () => {
    let connection; let database; let repository; let workflow; let nextId; let audits; let events;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-386', name: 'Org' });
        new ObjectiveRepository(database).create({ id: 'objective-386', organizationId: 'org-386', title: 'Objective', description: 'Work' });
        new ProjectRepository(database).create({ id: 'project-386', objectiveId: 'objective-386', name: 'Project', description: 'Work' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-386', 'org-386', 'Office', 'office-386');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-386', 'office-386', 'Department', 'department-386');
        new AgentRepository(database).create({ id: 'employee-386', name: 'Employee', role: 'EMPLOYEE', departmentId: 'department-386' });
        new TaskRepository(database).create({ id: 'task-386', taskCode: 'PH386-001', title: 'Fix crash', projectId: 'project-386', assigneeId: 'employee-386', status: 'IN_PROGRESS' });
        repository = new DebuggingSessionRepository(database); audits = new AuditLogRepository(database); events = new SqliteEventBus(database);
        let counter = 0; nextId = () => `debug-386-${++counter}`;
        workflow = createControlledDebuggingWorkflow({ sessionRepository: repository, taskRepository: new TaskRepository(database),
            agentRepository: new AgentRepository(database), auditRepository: audits, unitOfWork: createSqliteUnitOfWork(database),
            projectRepository: new ProjectRepository(database), objectiveRepository: new ObjectiveRepository(database),
            questionRepository: new DirectorQuestionRepository(database),
            eventPublisher: events, authorize: () => true, clock: { now: () => NOW }, idFactory: nextId });
    });
    afterEach(() => connection.close());

    async function start(extra = {}) {
        return workflow.start.run({ taskId: 'task-386', actorId: 'employee-386', actorRole: 'EMPLOYEE', confirm: true, ...extra });
    }
    async function step(sessionId, stage, outcome, extra = {}) {
        return workflow.recordStep.run({ sessionId, actorId: 'employee-386', actorRole: 'EMPLOYEE', stage,
            outcome, summary: `${stage} completed.`, files: [], ...extra });
    }

    it('rejects blocked tasks with a task-state explanation that matches the accepted state', async () => {
        new TaskRepository(database).update('task-386', { status: 'BLOCKED' });
        const result = await start();
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('debugging-task-not-active');
        expect(result.error.message).toMatch(/Only in-progress tasks/);
        expect(repository.listByTask('task-386')).toEqual([]);
    });

    it('enforces the debugging sequence and escalates after repeated failed hypotheses', async () => {
        const started = await start(); expect(started.ok).toBe(true);
        const sessionId = started.value.id;
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt === 0) {
                await step(sessionId, 'REPRODUCE', 'PASS'); await step(sessionId, 'INSPECT', 'PASS');
            }
            await step(sessionId, 'HYPOTHESIS', 'PASS', { confidence: 0.8 });
            const result = await step(sessionId, 'TEST_HYPOTHESIS', 'FAIL');
            if (attempt < 2) expect(result.value.session.stage).toBe('HYPOTHESIS');
            else {
                expect(result.value.session).toMatchObject({ status: 'ESCALATED', stopReason: 'repeated-test-failure', failedTestCount: 3 });
                expect(new TaskRepository(database).getById('task-386').status).toBe('BLOCKED');
            }
        }
        expect(repository.listSteps(sessionId)).toHaveLength(8);
        expect(audits.listByEntity('debugging-session', sessionId)).toHaveLength(9);
        expect(database.prepare('SELECT type, payload FROM events WHERE type = ?').all('TASK_ESCALATED'))
            .toMatchObject([{ type: 'TASK_ESCALATED', payload: expect.stringContaining('DEPT_MANAGER') }]);
        expect(new DirectorQuestionRepository(database).listByObjective('objective-386'))
            .toMatchObject([{ status: 'PENDING', category: 'DEBUGGING_ESCALATION', question: expect.stringContaining('Debugging session') }]);
        expect(database.prepare('SELECT type FROM events WHERE type = ?').all('QUESTION_ASKED'))
            .toHaveLength(1);
        expect((await step(sessionId, 'PATCH', 'PASS')).ok).toBe(false);
    });

    it('persists the complete reproduce-to-verify path and final resolution', async () => {
        const started = await start(); const sessionId = started.value.id;
        const path = [
            ['REPRODUCE', 'PASS', { files: ['src/main.js'], commandsRun: 1, tokensUsed: 40 }],
            ['INSPECT', 'PASS', { files: ['src\\main.js'], tokensUsed: 80 }],
            ['HYPOTHESIS', 'PASS', { confidence: 0.92, tokensUsed: 60 }],
            ['TEST_HYPOTHESIS', 'PASS', { commandsRun: 1, tokensUsed: 30 }],
            ['PATCH', 'PASS', { files: ['src/main.js'], commandsRun: 1, tokensUsed: 80 }],
            ['TEST', 'PASS', { commandsRun: 2, tokensUsed: 40 }],
            ['REVIEW', 'PASS', { tokensUsed: 40 }],
            ['VERIFY', 'PASS', { commandsRun: 1, tokensUsed: 20 }],
        ];
        let result;
        for (const [stage, outcome, extra] of path) result = await step(sessionId, stage, outcome, extra);
        expect(result.value.session).toMatchObject({ status: 'RESOLVED', stage: 'VERIFY', attemptCount: 8,
            filesTouched: 1, commandsRun: 6, tokensUsed: 390 });
        expect(new TaskRepository(database).getById('task-386')).toMatchObject({ status: 'IN_PROGRESS', blockerReason: null });
        expect(repository.listSteps(sessionId).map(({ stage }) => stage)).toEqual(path.map(([stage]) => stage));
        expect(() => database.prepare(`UPDATE debugging_sessions SET status = 'ACTIVE' WHERE id = ?`).run(sessionId))
            .toThrow(/terminal debugging sessions are immutable/);
        expect(() => database.prepare('UPDATE debugging_steps SET summary = ? WHERE session_id = ?').run('rewrite', sessionId))
            .toThrow(/debugging step records are immutable/);
    });

    it('escalates on exhausted execution budgets and low confidence without exceeding limits', async () => {
        const started = await start({ commandBudget: 1, timeBudgetMs: 1000 });
        const sessionId = started.value.id;
        await step(sessionId, 'REPRODUCE', 'PASS', { commandsRun: 1 });
        const exhausted = await step(sessionId, 'INSPECT', 'PASS', { commandsRun: 1 });
        expect(exhausted.value.session).toMatchObject({ status: 'ESCALATED', stopReason: 'resource-budget-exceeded', commandsRun: 1 });
        expect(new TaskRepository(database).getById('task-386')).toMatchObject({ status: 'BLOCKED', blockerReason: 'debugging-resource-budget-exceeded' });

        new TaskRepository(database).update('task-386', { status: 'IN_PROGRESS', blockerReason: null });
        const lowConfidence = await start();
        await step(lowConfidence.value.id, 'REPRODUCE', 'PASS');
        await step(lowConfidence.value.id, 'INSPECT', 'PASS');
        const escalated = await step(lowConfidence.value.id, 'HYPOTHESIS', 'PASS', { confidence: 0.2 });
        expect(escalated.value.session).toMatchObject({ status: 'ESCALATED', stopReason: 'low-confidence' });
    });

    it('escalates an expired debugging deadline and blocks the task instead of leaving an active task behind', async () => {
        const started = await start({ timeBudgetMs: 1000 });
        workflow = createControlledDebuggingWorkflow({ sessionRepository: repository, taskRepository: new TaskRepository(database),
            agentRepository: new AgentRepository(database), auditRepository: audits, unitOfWork: createSqliteUnitOfWork(database),
            projectRepository: new ProjectRepository(database), objectiveRepository: new ObjectiveRepository(database),
            questionRepository: new DirectorQuestionRepository(database), eventPublisher: events, authorize: () => true,
            clock: { now: () => '2026-10-06T12:00:01.000Z' }, idFactory: nextId });
        const expired = await step(started.value.id, 'REPRODUCE', 'PASS');
        expect(expired.value.session).toMatchObject({ status: 'ESCALATED', stopReason: 'time-budget-exceeded' });
        expect(new TaskRepository(database).getById('task-386')).toMatchObject({ status: 'BLOCKED', blockerReason: 'debugging-time-budget-exceeded' });
        expect(database.prepare('SELECT type FROM events WHERE type = ?').all('TASK_ESCALATED')).toHaveLength(1);
        expect(new DirectorQuestionRepository(database).listByObjective('objective-386')).toMatchObject([
            { status: 'PENDING', category: 'DEBUGGING_ESCALATION' },
        ]);
    });

    it('rejects path traversal and canonicalizes tracked file identities', async () => {
        const started = await start();
        const rejected = await step(started.value.id, 'REPRODUCE', 'PASS', { files: ['src/../outside.js'] });
        expect(rejected.ok).toBe(false);
        const accepted = await step(started.value.id, 'REPRODUCE', 'PASS', { files: ['src/main.js', 'src\\main.js'] });
        expect(accepted.value.session.filesTouched).toBe(1);
        expect(repository.listSteps(started.value.id)[0].files).toEqual(['src/main.js']);
    });

    it('rolls session creation back when start audit persistence fails', async () => {
        const broken = createControlledDebuggingWorkflow({ sessionRepository: repository, taskRepository: new TaskRepository(database),
            agentRepository: new AgentRepository(database), auditRepository: { append: vi.fn(() => { throw new Error('audit failure'); }) },
            projectRepository: new ProjectRepository(database), objectiveRepository: new ObjectiveRepository(database),
            questionRepository: new DirectorQuestionRepository(database),
            eventPublisher: events, unitOfWork: createSqliteUnitOfWork(database), authorize: () => true,
            clock: { now: () => NOW }, idFactory: nextId });
        expect((await broken.start.run({ taskId: 'task-386', actorId: 'employee-386', actorRole: 'EMPLOYEE', confirm: true })).ok).toBe(false);
        expect(repository.listByTask('task-386')).toEqual([]);
    });

    it('rolls escalation, task blocking and the Director question back together if question publication fails', async () => {
        const started = await start();
        const append = events.append.bind(events);
        vi.spyOn(events, 'append').mockImplementation((event) => {
            if (event.type === 'QUESTION_ASKED') throw new Error('question bus unavailable');
            return append(event);
        });
        await step(started.value.id, 'REPRODUCE', 'PASS');
        await step(started.value.id, 'INSPECT', 'PASS');
        const failed = await step(started.value.id, 'HYPOTHESIS', 'PASS', { confidence: 0.2 });
        expect(failed.ok).toBe(false);
        expect(repository.getById(started.value.id)).toMatchObject({ status: 'ACTIVE', stage: 'HYPOTHESIS', attemptCount: 2 });
        expect(new TaskRepository(database).getById('task-386').status).toBe('IN_PROGRESS');
        expect(new DirectorQuestionRepository(database).listByObjective('objective-386')).toEqual([]);
        expect(database.prepare('SELECT 1 FROM events WHERE type = ?').all('TASK_ESCALATED')).toEqual([]);
    });

    it('rolls deadline escalation, task blocking, and step attribution back together if escalation publication fails', async () => {
        const started = await start({ timeBudgetMs: 1000 });
        const append = events.append.bind(events);
        vi.spyOn(events, 'append').mockImplementation((event) => {
            if (event.type === 'TASK_ESCALATED') throw new Error('escalation bus unavailable');
            return append(event);
        });
        workflow = createControlledDebuggingWorkflow({ sessionRepository: repository, taskRepository: new TaskRepository(database),
            agentRepository: new AgentRepository(database), auditRepository: audits, unitOfWork: createSqliteUnitOfWork(database),
            projectRepository: new ProjectRepository(database), objectiveRepository: new ObjectiveRepository(database),
            questionRepository: new DirectorQuestionRepository(database), eventPublisher: events, authorize: () => true,
            clock: { now: () => '2026-10-06T12:00:01.000Z' }, idFactory: nextId });
        const failed = await step(started.value.id, 'REPRODUCE', 'PASS');
        expect(failed.ok).toBe(false);
        expect(repository.getById(started.value.id)).toMatchObject({ status: 'ACTIVE', stage: 'REPRODUCE', attemptCount: 0 });
        expect(new TaskRepository(database).getById('task-386').status).toBe('IN_PROGRESS');
        expect(repository.listSteps(started.value.id)).toEqual([]);
        expect(audits.listByEntity('debugging-session', started.value.id)).toHaveLength(1);
        expect(new DirectorQuestionRepository(database).listByObjective('objective-386')).toEqual([]);
    });
});
