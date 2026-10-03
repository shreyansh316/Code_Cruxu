/** Phase 038 — hierarchy-authorized review and bounded task rework. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTaskReviewUseCase } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { SqliteEventBus, createSqliteUnitOfWork } from '../src/infrastructure';
import { AgentRepository, AuditLogRepository, OrganizationRepository, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 038 — task review and rework', () => {
    let connection;
    let database;
    let agents;
    let tasks;
    let audit;
    let events;
    let id;
    let review;
    const criteria = [{ id: 'criterion-038', description: 'Change works', required: true, met: true }];
    const submittedResult = { summary: 'Implemented.', acceptanceCriteria: [
        { criterionId: 'criterion-038', met: true, evidence: 'Verification passed.' },
    ] };

    beforeEach(() => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'organization-038', name: 'HEADROOM' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-038', 'organization-038', 'Office', 'office-038');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-038', 'office-038', 'Department', 'department-038');
        agents = new AgentRepository(database);
        agents.create({ id: 'reviewer-038', name: 'Manager', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-038' });
        agents.create({ id: 'assignee-038', name: 'Employee', role: AgentRole.EMPLOYEE, departmentId: 'department-038' });
        tasks = new TaskRepository(database);
        tasks.create({ id: 'task-038', taskCode: 'PH038-001', title: 'Reviewed task', status: TaskStatus.REVIEW,
            creatorId: 'reviewer-038', assigneeId: 'assignee-038', acceptanceCriteria: criteria,
            result: submittedResult, retryCount: 0, maxRetries: 1 });
        audit = new AuditLogRepository(database);
        events = new SqliteEventBus(database);
        id = 0;
        review = makeReview();
    });
    afterEach(() => connection.close());

    function makeReview(eventPublisher = events) {
        return createTaskReviewUseCase({ taskRepository: tasks, agentRepository: agents,
            hierarchyProvider: { getSnapshot: () => ({
                organization: { id: 'organization-038', name: 'HEADROOM' },
                offices: [{ id: 'office-038', organizationId: 'organization-038', name: 'Office', slug: 'office-038', status: 'ACTIVE' }],
                departments: [{ id: 'department-038', officeId: 'office-038', name: 'Department', slug: 'department-038', status: 'ACTIVE' }],
                agents: agents.list(),
            }) }, auditRepository: audit, eventPublisher, unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => '2026-10-03T12:00:00.000Z' }, idFactory: () => `generated-038-${++id}` });
    }

    it('approves a valid result and moves the task to completed', async () => {
        const outcome = await review.run({ taskId: 'task-038', reviewerId: 'reviewer-038', decision: 'APPROVED' });
        expect(outcome.ok).toBe(true);
        expect(outcome.value).toMatchObject({ status: TaskStatus.COMPLETED, completedAt: '2026-10-03T12:00:00.000Z' });
        expect(audit.listByTask('task-038')[0].action).toBe('TASK_REVIEW_APPROVED');
        expect(events.database.prepare('SELECT type FROM events').all()).toEqual([{ type: 'TASK_REVIEW_PASSED' }]);
    });

    it('routes a failed review back to the assignee within the retry bound', async () => {
        const outcome = await review.run({ taskId: 'task-038', reviewerId: 'reviewer-038', decision: 'REWORK', feedback: 'Add a regression check.' });
        expect(outcome.ok).toBe(true);
        expect(outcome.value).toMatchObject({ status: TaskStatus.IN_PROGRESS, retryCount: 1,
            result: { reviewFeedback: 'Add a regression check.' }, acceptanceCriteria: [{ met: false }] });
        expect(events.database.prepare('SELECT type FROM events').all()).toEqual([{ type: 'TASK_REVIEW_FAILED' }]);
    });

    it('fails and escalates when the configured retry limit is exhausted', async () => {
        tasks.update('task-038', { retryCount: 1, maxRetries: 1 });
        const outcome = await review.run({ taskId: 'task-038', reviewerId: 'reviewer-038', decision: 'REWORK', feedback: 'Verification still fails.' });
        expect(outcome.ok).toBe(true);
        expect(outcome.value.status).toBe(TaskStatus.FAILED);
        expect(events.database.prepare('SELECT type, payload FROM events').get()).toMatchObject({
            type: 'TASK_ESCALATED', payload: expect.stringContaining('HEAD_MANAGER'),
        });
    });

    it('rejects unauthorized reviewers, invalid states, and empty rework feedback', async () => {
        const unauthorized = await review.run({ taskId: 'task-038', reviewerId: 'assignee-038', decision: 'APPROVED' });
        const noFeedback = await review.run({ taskId: 'task-038', reviewerId: 'reviewer-038', decision: 'REWORK', feedback: ' ' });
        tasks.update('task-038', { status: TaskStatus.IN_PROGRESS });
        const wrongState = await review.run({ taskId: 'task-038', reviewerId: 'reviewer-038', decision: 'APPROVED' });
        expect([unauthorized.error.code, noFeedback.error.code, wrongState.error.code]).toEqual([
            'unauthorized-task-review', 'invalid-task-review', 'invalid-task-transition',
        ]);
        expect(audit.listByTask('task-038')).toEqual([]);
    });

    it('rolls back review changes and audit entries when event persistence fails', async () => {
        const failing = makeReview({ append: () => { throw new Error('event persistence failed'); } });
        const outcome = await failing.run({ taskId: 'task-038', reviewerId: 'reviewer-038', decision: 'APPROVED' });
        expect(outcome.ok).toBe(false);
        expect(tasks.getById('task-038').status).toBe(TaskStatus.REVIEW);
        expect(audit.listByTask('task-038')).toEqual([]);
    });
});
