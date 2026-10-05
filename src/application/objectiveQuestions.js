import { EventType } from '../constants';
import { createDomainEvent, createEntityId, DomainInvariantError, QuestionStatus, transitionQuestion } from '../domain';
import { ApplicationError, createUseCase } from './useCase';
import { normalizeQuestionText } from '../shared/normalizeQuestionText';

const MAX_QUESTION_LENGTH = 2000;
const MAX_ANSWER_LENGTH = 10_000;

/** Build injected use cases for creating, answering, and skipping objective questions. */
export function createObjectiveQuestionWorkflow({
    questionRepository, objectiveRepository, idFactory, eventPublisher, unitOfWork, clock,
} = {}) {
    if (typeof questionRepository?.create !== 'function' || typeof questionRepository?.getById !== 'function'
        || typeof questionRepository?.update !== 'function' || typeof questionRepository?.listByObjective !== 'function'
        || typeof questionRepository?.nextSortOrder !== 'function'
        || typeof objectiveRepository?.getById !== 'function' || typeof idFactory !== 'function'
        || typeof eventPublisher?.append !== 'function' || typeof unitOfWork?.run !== 'function'
        || typeof clock?.now !== 'function') {
        throw new TypeError('Question workflow requires repositories, event, transaction, and clock ports.');
    }

    const create = createUseCase({
        name: 'objective-question-create', dependencies: { questionRepository, objectiveRepository, idFactory, eventPublisher, unitOfWork, clock },
        execute: ({ input, dependencies }) => {
            if (!input || typeof input.objectiveId !== 'string' || typeof input.question !== 'string') {
                throw new DomainInvariantError('invalid-objective-question', 'Objective id and question text are required.');
            }
            const objectiveId = createEntityId(input.objectiveId);
            if (!dependencies.objectiveRepository.getById(objectiveId)) {
                throw new ApplicationError('objective-not-found', 'The requested objective does not exist.');
            }
            const questionText = input.question.trim();
            if (!questionText || questionText.length > MAX_QUESTION_LENGTH) {
                throw new DomainInvariantError('invalid-objective-question',
                    `Question text must contain 1 to ${MAX_QUESTION_LENGTH} characters.`);
            }
            const normalizedQuestion = normalizeQuestionText(questionText);
            if (dependencies.questionRepository.listByObjective(objectiveId)
                .some((existing) => normalizeQuestionText(existing.question) === normalizedQuestion)) {
                throw new DomainInvariantError('duplicate-objective-question',
                    'This clarification has already been asked for the objective. Review the existing question before adding another.');
            }
            const category = input.category == null ? null : input.category.trim();
            if (category !== null && (!category || category.length > 100)) {
                throw new DomainInvariantError('invalid-objective-question-category', 'Question category must contain 1 to 100 characters.');
            }
            const questionId = createEntityId(dependencies.idFactory());
            return dependencies.unitOfWork.run(() => {
                const question = dependencies.questionRepository.create({
                    id: questionId, objectiveId, question: questionText,
                    status: QuestionStatus.PENDING, category,
                    sortOrder: dependencies.questionRepository.nextSortOrder(objectiveId),
                });
                dependencies.eventPublisher.append(createQuestionEvent({
                    dependencies, type: EventType.QUESTION_ASKED, question,
                }));
                return question;
            });
        },
    });

    const answer = createUseCase({
        name: 'objective-question-answer', dependencies: { questionRepository, eventPublisher, unitOfWork, clock, idFactory },
        execute: ({ input, dependencies }) => {
            const question = getQuestion(dependencies.questionRepository, input?.questionId);
            const answerText = typeof input?.answer === 'string' ? input.answer.trim() : '';
            if (!answerText || answerText.length > MAX_ANSWER_LENGTH) {
                throw new DomainInvariantError('invalid-objective-answer', `Answer must contain 1 to ${MAX_ANSWER_LENGTH} characters.`);
            }
            const transitioned = transitionQuestion(question, QuestionStatus.ANSWERED);
            return dependencies.unitOfWork.run(() => {
                const updated = dependencies.questionRepository.update(transitioned.id, {
                    answer: answerText, status: transitioned.status,
                });
                dependencies.eventPublisher.append(createQuestionEvent({
                    dependencies, type: EventType.QUESTION_ANSWERED, question: updated,
                }));
                return updated;
            });
        },
    });

    const skip = createUseCase({
        name: 'objective-question-skip', dependencies: { questionRepository, eventPublisher, unitOfWork, clock, idFactory },
        execute: ({ input, dependencies }) => {
            const question = getQuestion(dependencies.questionRepository, input?.questionId);
            const transitioned = transitionQuestion(question, QuestionStatus.SKIPPED);
            return dependencies.unitOfWork.run(() => {
                const updated = dependencies.questionRepository.update(transitioned.id, { status: transitioned.status });
                dependencies.eventPublisher.append(createQuestionEvent({
                    dependencies, type: EventType.QUESTION_SKIPPED, question: updated,
                }));
                return updated;
            });
        },
    });

    return Object.freeze({ create, answer, skip });
}

function createQuestionEvent({ dependencies, type, question }) {
    const now = dependencies.clock.now();
    const occurredAt = (now instanceof Date ? now : new Date(now)).toISOString();
    return createDomainEvent({
        eventId: createEntityId(dependencies.idFactory()), type,
        aggregateId: createEntityId(question.objectiveId), occurredAt,
        payload: { questionId: question.id, objectiveId: question.objectiveId },
    });
}

function getQuestion(repository, questionId) {
    if (typeof questionId !== 'string' || questionId.trim() === '') {
        throw new DomainInvariantError('invalid-question-id', 'A question identifier is required.');
    }
    const question = repository.getById(createEntityId(questionId));
    if (!question) throw new ApplicationError('question-not-found', 'The requested clarification question does not exist.');
    return question;
}
