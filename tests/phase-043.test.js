/** Phase 043 — authorized runtime contracts and role-bound identity. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuthorizedAgentRuntime } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { SqliteConnection } from '../src/storage';
import { AgentRepository, OrganizationRepository, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 043 — agent runtime contracts', () => {
    let connection;
    let database;
    let agents;
    let tasks;
    let hierarchyProvider;
    let nextId;
    let requestCounter;
    const criteria = [{ id: 'criterion-043', description: 'Required work passes', required: true, met: false }];
    const validResult = { summary: 'Work complete.', acceptanceCriteria: [
        { criterionId: 'criterion-043', met: true, evidence: 'Check passed.' },
    ] };

    beforeEach(() => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'organization-043', name: 'HEADROOM' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-043', 'organization-043', 'Office', 'office-043');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-043', 'office-043', 'Department', 'department-043');
        agents = new AgentRepository(database);
        agents.create({ id: 'manager-043', name: 'Manager', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-043' });
        agents.create({ id: 'employee-043', name: 'Employee', role: AgentRole.EMPLOYEE, departmentId: 'department-043' });
        agents.create({ id: 'other-employee-043', name: 'Other Employee', role: AgentRole.EMPLOYEE, departmentId: 'department-043' });
        tasks = new TaskRepository(database);
        tasks.create({ id: 'task-043', taskCode: 'PH043-001', title: 'Bounded task', description: 'Only task-specific context',
            status: TaskStatus.IN_PROGRESS, creatorId: 'manager-043', assigneeId: 'employee-043',
            acceptanceCriteria: criteria, tokenBudget: 500, timeBudgetMs: 30_000, retryCount: 0, maxRetries: 2 });
        hierarchyProvider = { getSnapshot: () => ({
            organization: { id: 'organization-043', name: 'HEADROOM' },
            offices: [{ id: 'office-043', organizationId: 'organization-043', name: 'Office', slug: 'office-043', status: 'ACTIVE' }],
            departments: [{ id: 'department-043', officeId: 'office-043', name: 'Department', slug: 'department-043', status: 'ACTIVE' }],
            agents: agents.list(),
        }) };
        let id = 0;
        nextId = () => `generated-043-${++id}`;
        requestCounter = 0;
    });
    afterEach(() => connection.close());

    function runtime(adapter) {
        return createAuthorizedAgentRuntime({ agentRepository: agents, taskRepository: tasks,
            hierarchyProvider, adapter, clock: { now: () => '2026-10-04T08:00:00.000Z' }, idFactory: nextId });
    }

    function run(useCase, overrides = {}) {
        const controller = new AbortController();
        return useCase.run({ taskId: 'task-043', agentId: 'employee-043', requestId: `request-${++requestCounter}`,
            signal: controller.signal, ...overrides });
    }

    it('creates a correlated immutable task-only packet and validates the response', async () => {
        let captured;
        const useCase = runtime({ execute: async (request) => { captured = request; return validResult; } });
        const outcome = await run(useCase, { role: AgentRole.CEO, context: { secret: 'must-not-forward' } });
        expect(outcome.ok).toBe(true);
        expect(outcome.value).toMatchObject({ outcome: 'SUCCEEDED', requestId: 'generated-043-1',
            agentId: 'employee-043', agentRole: AgentRole.EMPLOYEE, taskId: 'task-043', result: validResult });
        expect(Object.isFrozen(captured)).toBe(true);
        expect(captured.task).toMatchObject({ id: 'task-043', tokenBudget: 500, timeBudgetMs: 30_000 });
        expect(captured).not.toHaveProperty('context');
        expect(captured.task).not.toHaveProperty('assigneeId');
        expect(captured.agent.role).toBe(AgentRole.EMPLOYEE);
    });

    it('rejects unauthorized identities, invalid task states, and unavailable agents before adapter access', async () => {
        let calls = 0;
        const useCase = runtime({ execute: async () => { calls += 1; return validResult; } });
        const wrongAgent = await run(useCase, { agentId: 'other-employee-043' });
        tasks.update('task-043', { status: TaskStatus.REVIEW });
        const wrongState = await run(useCase);
        agents.update('employee-043', { status: 'OFFLINE' });
        tasks.update('task-043', { status: TaskStatus.IN_PROGRESS });
        const unavailable = await run(useCase);
        expect([wrongAgent.error.code, wrongState.error.code, unavailable.error.code]).toEqual([
            'unauthorized-agent-task', 'invalid-task-transition', 'agent-unavailable',
        ]);
        expect(calls).toBe(0);
    });

    it('returns explicit cancellation without invoking an already-aborted adapter', async () => {
        let calls = 0;
        const controller = new AbortController();
        controller.abort();
        const useCase = runtime({ execute: async () => { calls += 1; return validResult; } });
        const outcome = await useCase.run({ taskId: 'task-043', agentId: 'employee-043',
            requestId: 'request-cancelled-043', signal: controller.signal });
        expect(outcome.value).toMatchObject({ outcome: 'CANCELLED', taskId: 'task-043' });
        expect(calls).toBe(0);
    });

    it('forwards active cancellation through the adapter signal and returns a cancelled response', async () => {
        let resolveStarted;
        const started = new Promise((resolve) => { resolveStarted = resolve; });
        const useCase = runtime({ execute: (_request, { signal }) => {
            resolveStarted();
            return new Promise((resolve, reject) => signal.addEventListener('abort',
                () => reject(new Error('adapter cancelled')), { once: true }));
        } });
        const controller = new AbortController();
        const running = useCase.run({ taskId: 'task-043', agentId: 'employee-043', signal: controller.signal });
        await started;
        controller.abort();
        const outcome = await running;
        expect(outcome.value).toMatchObject({ outcome: 'CANCELLED', taskId: 'task-043' });
    });

    it('maps adapter failures to stable outcomes without exposing exception text', async () => {
        const useCase = runtime({ execute: async () => { throw new Error('credential=secret-value'); } });
        const outcome = await run(useCase);
        expect(outcome.value).toMatchObject({ outcome: 'FAILED', errorCode: 'agent-execution-failed' });
        expect(JSON.stringify(outcome.value)).not.toContain('secret-value');
    });

    it('rejects malformed task output instead of reporting success', async () => {
        const useCase = runtime({ execute: async () => ({ summary: 'done', acceptanceCriteria: [] }) });
        const outcome = await run(useCase);
        expect(outcome.value).toMatchObject({ outcome: 'FAILED', errorCode: 'invalid-task-result' });
    });
});
