import { createEntityId } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

const MAX_PROPOSED_QUESTIONS = 8;
const MAX_QUESTION_LENGTH = 2000;
const MAX_RATIONALE_LENGTH = 1000;
const OUTPUT_SCHEMA = Object.freeze({
    type: 'object', additionalProperties: false, required: ['questions'],
    properties: { questions: { type: 'array', maxItems: MAX_PROPOSED_QUESTIONS, items: {
        type: 'object', additionalProperties: false, required: ['question', 'category', 'rationale'],
        properties: {
            question: { type: 'string', minLength: 1, maxLength: MAX_QUESTION_LENGTH },
            category: { type: 'string', minLength: 1, maxLength: 100 },
            rationale: { type: 'string', minLength: 1, maxLength: MAX_RATIONALE_LENGTH },
        },
    } } },
});
const SYSTEM_PROMPT = [
    'You are HEADROOM AI Director. Analyze the CEO objective only for ambiguity that blocks safe, useful planning.',
    'Propose concise clarification questions. Do not answer for the CEO, approve the objective, create a plan, or claim work is approved.',
    'Use the supplied schema. If no blocking ambiguity exists, return an empty questions array.',
].join(' ');

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
                .filter(({ status }) => status === 'ANSWERED' || status === 'SKIPPED')
                .map(({ question, answer, status }) => ({ question, answer: status === 'ANSWERED' ? answer : null, status }));
            const result = await dependencies.provider.generate({
                requestId: createEntityId(dependencies.idFactory()),
                model: input.model,
                systemPrompt: SYSTEM_PROMPT,
                input: { objective: { title: objective.title, description: objective.description }, priorQuestions },
                outputSchema: OUTPUT_SCHEMA,
            }, input.signal ? { signal: input.signal, budget: input.budget } : { budget: input.budget });
            if (result.finishReason === 'ERROR') {
                throw new ApplicationError(result.errorCode, 'Director objective analysis could not be completed.', { retryable: true });
            }
            if (result.finishReason !== 'STOP') {
                throw new ApplicationError(`director-analysis-${result.finishReason.toLowerCase()}`,
                    'Director objective analysis did not produce a complete result.');
            }
            return Object.freeze({ objectiveId, questions: validateProposals(result.output) });
        },
    });
}

function validateProposals(output) {
    if (!output || typeof output !== 'object' || Array.isArray(output)
        || Object.keys(output).length !== 1 || !Array.isArray(output.questions)
        || output.questions.length > MAX_PROPOSED_QUESTIONS) {
        throw new ApplicationError('invalid-director-analysis', 'Director analysis returned an invalid question proposal set.');
    }
    const questions = output.questions.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || Object.keys(item).sort().join(',') !== 'category,question,rationale'
            || typeof item.question !== 'string' || !item.question.trim() || item.question.trim().length > MAX_QUESTION_LENGTH
            || typeof item.category !== 'string' || !item.category.trim() || item.category.trim().length > 100
            || typeof item.rationale !== 'string' || !item.rationale.trim() || item.rationale.trim().length > MAX_RATIONALE_LENGTH) {
            throw new ApplicationError('invalid-director-analysis', 'Director analysis returned a malformed clarification question.');
        }
        return Object.freeze({ question: item.question.trim(), category: item.category.trim(), rationale: item.rationale.trim() });
    });
    return Object.freeze(questions);
}
