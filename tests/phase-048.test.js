/** Phase 048 — Director objective analysis proposes structured questions only. */
import { describe, expect, it, vi } from 'vitest';
import { createDirectorObjectiveAnalysis } from '../src/application';

const objective = { id: 'objective-048', title: 'Launch a mobile app', description: 'Build and launch an app.' };
const proposal = { questions: [{ question: 'Which platforms are in scope?', category: 'scope',
    rationale: 'The objective does not name supported mobile platforms.' }] };

function makeAnalysis({ output = proposal, finishReason = 'STOP', questions = [] } = {}) {
    const provider = { generate: vi.fn(async (request) => ({ requestId: request.requestId, model: request.model,
        finishReason, usage: { inputTokens: 15, outputTokens: 12 },
        ...(finishReason === 'STOP' ? { output } : { errorCode: 'provider-unavailable' }) })) };
    const questionRepository = { listByObjective: vi.fn(() => questions) };
    let id = 0;
    const analysis = createDirectorObjectiveAnalysis({
        objectiveRepository: { getById: vi.fn((id) => id === objective.id ? objective : undefined) },
        questionRepository, provider, idFactory: () => `analysis-request-${++id}`,
    });
    return { analysis, provider, questionRepository };
}

describe('Phase 048 — Director objective analysis', () => {
    it('submits bounded objective context and returns validated proposals without creating questions', async () => {
        const { analysis, provider, questionRepository } = makeAnalysis({ questions: [
            { question: 'Who is the audience?', answer: 'Small businesses', status: 'ANSWERED' },
            { question: 'Which platform?', answer: null, status: 'PENDING' },
        ] });
        const result = await analysis.run({ objectiveId: objective.id, model: 'gemini-reasoning-test' });
        expect(result).toEqual({ ok: true, value: { objectiveId: objective.id, questions: proposal.questions } });
        const request = provider.generate.mock.calls[0][0];
        expect(request).toMatchObject({ model: 'gemini-reasoning-test',
            input: { objective: { title: objective.title, description: objective.description },
                priorQuestions: [{ question: 'Who is the audience?', answer: 'Small businesses', status: 'ANSWERED' },
                    { question: 'Which platform?', answer: null, status: 'PENDING' }] },
            outputSchema: { type: 'object', required: ['questions'] } });
        expect(request.systemPrompt).toMatch(/Do not answer for the CEO, approve the objective/);
        expect(questionRepository.listByObjective).toHaveBeenCalledWith(objective.id);
    });

    it('rejects missing objectives and provider failures without claiming approval', async () => {
        const missing = createDirectorObjectiveAnalysis({ objectiveRepository: { getById: () => undefined },
            questionRepository: { listByObjective: () => [] }, provider: { generate: vi.fn() }, idFactory: () => 'request' });
        expect((await missing.run({ objectiveId: objective.id, model: 'model' })).error.code).toBe('objective-not-found');
        const failed = makeAnalysis({ finishReason: 'ERROR' });
        expect((await failed.analysis.run({ objectiveId: objective.id, model: 'model' })).error.code)
            .toBe('provider-unavailable');
    });

    it('rejects malformed, oversized, and extra provider proposal fields', async () => {
        for (const output of [null, { questions: 'not-an-array' }, { questions: Array(9).fill(proposal.questions[0]) },
            { ...proposal, approved: true }, { questions: [{ ...proposal.questions[0], answer: 'invented' }] },
            { questions: [{ ...proposal.questions[0], question: ' ' }] },
            { questions: [{ ...proposal.questions[0], rationale: 'r'.repeat(1001) }] }]) {
            const { analysis } = makeAnalysis({ output });
            expect((await analysis.run({ objectiveId: objective.id, model: 'model' })).ok).toBe(false);
        }
    });

    it('returns no proposals for an unambiguous objective and never mutates objective state', async () => {
        const { analysis, provider } = makeAnalysis({ output: { questions: [] } });
        expect((await analysis.run({ objectiveId: objective.id, model: 'model' })).value.questions).toEqual([]);
        expect(provider.generate).toHaveBeenCalledOnce();
        expect(objective).toEqual({ id: 'objective-048', title: 'Launch a mobile app', description: 'Build and launch an app.' });
    });

    it('removes duplicate proposals already asked and duplicates within one provider response', async () => {
        const { analysis, provider } = makeAnalysis({
            questions: [{ question: 'Which platforms are in scope?', status: 'PENDING' }],
            output: { questions: [
                ...proposal.questions,
                { question: ' Which platforms are in scope?! ', category: 'scope', rationale: 'Another phrasing.' },
                { question: 'Who is the audience?', category: 'scope', rationale: 'The objective does not identify an audience.' },
                { question: '  who is THE audience?! ', category: 'users', rationale: 'Audience details are still missing.' },
            ] },
        });
        const result = await analysis.run({ objectiveId: objective.id, model: 'model' });
        expect(result.value.questions).toEqual([
            { question: 'Who is the audience?', category: 'scope', rationale: 'The objective does not identify an audience.' },
        ]);
        expect(provider.generate.mock.calls[0][0].input.priorQuestions).toEqual([
            { question: 'Which platforms are in scope?', answer: null, status: 'PENDING' },
        ]);
    });
});
