import { createEntityId } from '../domain';
import { ApplicationError, createUseCase } from './useCase';
import { getPromptContract } from './promptRegistry';
import { normalizeQuestionText } from '../shared/normalizeQuestionText';

const MAX_PROPOSED_QUESTIONS = 8;
const MAX_QUESTION_LENGTH = 2000;
const MAX_RATIONALE_LENGTH = 1000;
const PROMPT = getPromptContract('director.objective-analysis.v1');

/** Analyze an objective and return validated, non-persisted clarification proposals. */
export function createDirectorObjectiveAnalysis({ objectiveRepository, questionRepository,
    provider, idFactory } = {}) {
    if (typeof objectiveRepository?.getById !== 'function'
        || typeof questionRepository?.listByObjective !== 'function'
        || typeof provider?.generate !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Director analysis requires objective/question repositories, an AI provider port, and an ID factory.');
    }
    return createUseCase({
        name: 'director-objective-analysis', dependencies: { objectiveRepository, questionRepository, provider, idFactory },
        execute: async ({ input, dependencies }) => {
            if (typeof input?.objectiveId !== 'string' || !input.objectiveId.trim()) {
                throw new ApplicationError('invalid-objective-id', 'An objective identifier is required.');
            }
            const objectiveId = createEntityId(input.objectiveId);
            const objective = dependencies.objectiveRepository.getById(objectiveId);
            if (!objective) throw new ApplicationError('objective-not-found', 'The requested objective does not exist.');
            const priorQuestions = dependencies.questionRepository.listByObjective(objectiveId)
                .map(({ question, answer, status }) => ({ question,
                    answer: status === 'ANSWERED' ? answer : null, status }));
            const result = await dependencies.provider.generate({
                requestId: createEntityId(dependencies.idFactory()),
                model: input.model,
                systemPrompt: PROMPT.systemPrompt,
                input: { objective: { title: objective.title, description: objective.description }, priorQuestions },
                outputSchema: PROMPT.outputSchema,
            }, input.signal ? { signal: input.signal, budget: input.budget } : { budget: input.budget });
            if (result.finishReason === 'ERROR') {
                throw new ApplicationError(result.errorCode, 'Director objective analysis could not be completed.', { retryable: true });
            }
            if (result.finishReason !== 'STOP') {
                throw new ApplicationError(`director-analysis-${result.finishReason.toLowerCase()}`,
                    'Director objective analysis did not produce a complete result.');
            }
            return Object.freeze({ objectiveId, questions: validateProposals(result.output, priorQuestions) });
        },
    });
}

function validateProposals(output, priorQuestions) {
    if (!output || typeof output !== 'object' || Array.isArray(output)
        || Object.keys(output).length !== 1 || !Array.isArray(output.questions)
        || output.questions.length > MAX_PROPOSED_QUESTIONS) {
        throw new ApplicationError('invalid-director-analysis', 'Director analysis returned an invalid question proposal set.');
    }
    const proposed = output.questions.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || Object.keys(item).sort().join(',') !== 'category,question,rationale'
            || typeof item.question !== 'string' || !item.question.trim() || item.question.trim().length > MAX_QUESTION_LENGTH
            || typeof item.category !== 'string' || !item.category.trim() || item.category.trim().length > 100
            || typeof item.rationale !== 'string' || !item.rationale.trim() || item.rationale.trim().length > MAX_RATIONALE_LENGTH) {
            throw new ApplicationError('invalid-director-analysis', 'Director analysis returned a malformed clarification question.');
        }
        return Object.freeze({ question: item.question.trim(), category: item.category.trim(), rationale: item.rationale.trim() });
    });
    const seen = new Set(priorQuestions.map(({ question }) => normalizeQuestionText(question)));
    const unique = proposed.filter(({ question }) => {
        const normalized = normalizeQuestionText(question);
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
    return Object.freeze(unique);
}
