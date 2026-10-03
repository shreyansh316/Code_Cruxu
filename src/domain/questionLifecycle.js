import { DomainInvariantError } from './errors';

export const QuestionStatus = Object.freeze({ PENDING: 'PENDING', ANSWERED: 'ANSWERED', SKIPPED: 'SKIPPED' });
const QUESTION_TRANSITIONS = Object.freeze({
    [QuestionStatus.PENDING]: [QuestionStatus.ANSWERED, QuestionStatus.SKIPPED],
    [QuestionStatus.ANSWERED]: [],
    [QuestionStatus.SKIPPED]: [],
});

export function canTransitionQuestion(from, to) {
    return Object.values(QuestionStatus).includes(from) && Object.values(QuestionStatus).includes(to)
        && QUESTION_TRANSITIONS[from].includes(to);
}

export function transitionQuestion(question, to) {
    if (!question || typeof question.id !== 'string' || typeof question.objectiveId !== 'string'
        || typeof question.question !== 'string' || !Object.values(QuestionStatus).includes(question.status)) {
        throw new DomainInvariantError('invalid-question', 'Clarification question is invalid.');
    }
    if (!canTransitionQuestion(question.status, to)) {
        throw new DomainInvariantError('invalid-question-transition',
            `Question cannot transition from ${String(question.status)} to ${String(to)}.`);
    }
    return { ...question, status: to };
}
