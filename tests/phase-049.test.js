/** Phase 049 — Director plan proposals pass deterministic validation before CEO approval. */
import { describe, expect, it, vi } from 'vitest';
import { createDirectorPlanProposal } from '../src/application';
import { assertPlanApproved } from '../src/domain';

const objective = { id: 'objective-049', title: 'Ship service', description: 'Ship a reliable service.' };
const validOutput = () => ({
    projects: [{ name: 'Service' }],
    milestones: [{ projectIndex: 0, title: 'Build' }, { projectIndex: 0, title: 'Release' }],
    tasks: [
        { projectIndex: 0, milestoneIndex: 0, title: 'Implement API', acceptanceCriteria: ['API responds', 'Errors are documented'] },
        { projectIndex: 0, milestoneIndex: 1, title: 'Verify release', acceptanceCriteria: ['Checks pass'] },
    ],
    dependencies: [{ dependentTaskIndex: 1, dependencyTaskIndex: 0 }],
});

function makeProposal(output = validOutput(), questions = []) {
    const provider = { generate: vi.fn(async (request) => ({ requestId: request.requestId, model: request.model,
        finishReason: 'STOP', usage: { inputTokens: 20, outputTokens: 30 }, output })) };
    let id = 0;
    const proposal = createDirectorPlanProposal({ objectiveRepository: { getById: (id) => id === objective.id ? objective : null },
        questionRepository: { listByObjective: vi.fn(() => questions) }, provider,
        idFactory: () => `plan-proposal-${++id}` });
    return { proposal, provider };
}

describe('Phase 049 — Director plan proposal', () => {
    it('generates a validated but unapproved plan from objective and answered scope', async () => {
        const { proposal, provider } = makeProposal(validOutput(), [
            { question: 'Which platform?', answer: 'Web', status: 'ANSWERED' },
            { question: 'Brand?', status: 'SKIPPED', answer: null },
        ]);
        const result = await proposal.run({ objectiveId: objective.id, model: 'reasoning-model' });
        expect(result.ok).toBe(true);
        expect(result.value).toMatchObject({ objectiveId: objective.id, tasks: [
            { taskCode: 'DIR-001', title: 'Implement API', acceptanceCriteria: [
                { description: 'API responds', required: true, met: false },
                { description: 'Errors are documented', required: true, met: false },
            ] }, { taskCode: 'DIR-002', title: 'Verify release' },
        ], dependencies: [{ dependentTaskId: result.value.tasks[1].id, dependencyTaskId: result.value.tasks[0].id }] });
        expect(result.value).not.toHaveProperty('approval');
        expect(() => assertPlanApproved(result.value)).toThrow(/CEO approval/);
        expect(Object.isFrozen(result.value.tasks[0].acceptanceCriteria[0])).toBe(true);
        expect(provider.generate.mock.calls[0][0].input.answeredQuestions).toEqual([{ question: 'Which platform?', answer: 'Web' }]);
    });

    it('blocks planning while clarification remains pending and rejects missing objectives', async () => {
        const pending = makeProposal(validOutput(), [{ status: 'PENDING', question: 'Scope?', answer: null }]);
        expect((await pending.proposal.run({ objectiveId: objective.id, model: 'model' })).error.code)
            .toBe('objective-clarification-pending');
        expect(pending.provider.generate).not.toHaveBeenCalled();
        const missing = createDirectorPlanProposal({ objectiveRepository: { getById: () => undefined },
            questionRepository: { listByObjective: () => [] }, provider: { generate: vi.fn() }, idFactory: () => 'plan' });
        expect((await missing.run({ objectiveId: 'missing', model: 'model' })).error.code).toBe('objective-not-found');
    });

    it('rejects invalid indexes, forward/cyclic dependencies, missing criteria, and oversized plans', async () => {
        const cases = [];
        const unknownReference = validOutput(); unknownReference.tasks[0].milestoneIndex = 9; cases.push(unknownReference);
        const forwardEdge = validOutput(); forwardEdge.dependencies[0] = { dependentTaskIndex: 0, dependencyTaskIndex: 1 }; cases.push(forwardEdge);
        const cycle = validOutput(); cycle.dependencies.push({ dependentTaskIndex: 0, dependencyTaskIndex: 1 }); cases.push(cycle);
        const noCriteria = validOutput(); noCriteria.tasks[0].acceptanceCriteria = []; cases.push(noCriteria);
        const extra = validOutput(); extra.tasks[0].execute = 'unsafe'; cases.push(extra);
        const tooMany = validOutput(); tooMany.tasks = Array(81).fill(tooMany.tasks[0]); cases.push(tooMany);
        for (const output of cases) {
            const { proposal } = makeProposal(output);
            expect((await proposal.run({ objectiveId: objective.id, model: 'model' })).error.code).toBe('invalid-director-plan');
        }
    });

    it('surfaces incomplete provider outcomes without returning a plan', async () => {
        const { proposal } = makeProposal();
        const result = await proposal.run({ objectiveId: objective.id, model: 'model' });
        expect(result.ok).toBe(true);
        const failing = makeProposal();
        failing.provider.generate.mockResolvedValue({ requestId: 'plan-proposal-1', model: 'model',
            finishReason: 'ERROR', usage: { inputTokens: 0, outputTokens: 0 }, errorCode: 'provider-unavailable' });
        expect((await failing.proposal.run({ objectiveId: objective.id, model: 'model' })).error)
            .toMatchObject({ code: 'provider-unavailable' });
    });
});
