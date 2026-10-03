/** Phase 035 — CEO-only execution plan approval boundary. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlanApprovalUseCase } from '../src/application';
import { AgentRole } from '../src/constants';
import { assertPlanApproved, PlanDecision } from '../src/domain';
import { AgentRepository, SqliteConnection, applyMigrations } from '../src/storage';

const validPlan = () => ({
    id: 'plan-approved', objectiveId: 'objective-1',
    projects: [{ id: 'project-1', name: 'Project' }],
    milestones: [{ id: 'milestone-1', projectId: 'project-1', title: 'Release' }],
    tasks: [{ id: 'task-1', taskCode: 'APPROVAL-001', title: 'Build', projectId: 'project-1',
        milestoneId: 'milestone-1', acceptanceCriteria: [{ id: 'criterion-1', description: 'Passes', required: true, met: false }] }],
    dependencies: [],
});

describe('Phase 035 — plan approval', () => {
    let connection;
    let agents;
    let approval;
    beforeEach(() => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        agents = new AgentRepository(database);
        agents.create({ id: 'ceo-approver', name: 'CEO', role: AgentRole.CEO });
        agents.create({ id: 'employee-approver', name: 'Employee', role: AgentRole.EMPLOYEE });
        approval = createPlanApprovalUseCase({ agentRepository: agents,
            clock: { now: () => new Date('2026-10-03T12:00:00.000Z') } });
    });
    afterEach(() => connection.close());

    it('blocks execution while unapproved and allows a persisted CEO approval', async () => {
        const plan = validPlan();
        expect(() => assertPlanApproved(plan)).toThrowError(expect.objectContaining({ code: 'plan-not-approved' }));
        const result = await approval.run({ plan, approverId: 'ceo-approver', decision: PlanDecision.APPROVED });
        expect(result.ok).toBe(true);
        expect(result.value.approval).toEqual({ decision: 'APPROVED', approverId: 'ceo-approver',
            approverRole: 'CEO', decidedAt: '2026-10-03T12:00:00.000Z' });
        expect(assertPlanApproved(result.value)).toBe(result.value);
        expect(plan.approval).toBeUndefined();
    });

    it('denies non-CEO or unknown agents and rejects subsequent decision replacement', async () => {
        for (const approverId of ['employee-approver', 'missing-agent']) {
            expect((await approval.run({ plan: validPlan(), approverId, decision: 'APPROVED' })).error.code)
                .toBe('plan-approval-forbidden');
        }
        const result = await approval.run({ plan: validPlan(), approverId: 'ceo-approver', decision: 'REJECTED' });
        expect(result.ok).toBe(true);
        expect(() => assertPlanApproved(result.value)).toThrowError(/CEO approval is required/);
        expect((await approval.run({ plan: result.value, approverId: 'ceo-approver', decision: 'APPROVED' })).error.code)
            .toBe('plan-already-decided');
    });

    it('rejects unvalidated plans before recording a decision', async () => {
        const result = await approval.run({ plan: { id: 'incomplete' }, approverId: 'ceo-approver', decision: 'APPROVED' });
        expect(result).toMatchObject({ ok: false, error: { code: 'invalid-execution-plan' } });
    });
});
