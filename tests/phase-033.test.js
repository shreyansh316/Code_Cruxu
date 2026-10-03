/** Phase 033 — objective clarification question lifecycle and ordering. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createObjectiveQuestionWorkflow } from '../src/application';
import { canTransitionQuestion, QuestionStatus, transitionQuestion } from '../src/domain';
import { SqliteEventBus, createSqliteUnitOfWork } from '../src/infrastructure';
import { DirectorQuestionRepository, ObjectiveRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 033 — objective question workflow', () => {
    let connection;
    let objectives;
    let questions;
    let workflow;
    let nextId;
    let database;
    beforeEach(() => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        objectives = new ObjectiveRepository(database);
        questions = new DirectorQuestionRepository(database);
        objectives.create({ id: 'question-objective', title: 'Objective', description: 'Description' });
        let index = 0;
        nextId = () => `question-${++index}`;
        const eventPublisher = new SqliteEventBus(database);
        workflow = createObjectiveQuestionWorkflow({ questionRepository: questions,
            objectiveRepository: objectives, idFactory: nextId, eventPublisher,
            unitOfWork: createSqliteUnitOfWork(database), clock: { now: () => new Date('2026-10-03T12:00:00.000Z') } });
    });
    afterEach(() => connection.close());

    it('creates pending questions in stable per-objective order', async () => {
        const first = await workflow.create.run({ objectiveId: 'question-objective', question: '  What is in scope?  ' });
        const second = await workflow.create.run({ objectiveId: 'question-objective', question: 'Which platform?', category: 'technical' });
        expect(first.value).toMatchObject({ question: 'What is in scope?', status: 'PENDING', sortOrder: 0 });
        expect(second.value).toMatchObject({ category: 'technical', status: 'PENDING', sortOrder: 1 });
        expect(questions.listByObjective('question-objective').map(({ id }) => id))
            .toEqual([first.value.id, second.value.id]);
        expect(database.prepare('SELECT type, aggregate_id FROM events ORDER BY rowid').all()).toEqual([
            { type: 'QUESTION_ASKED', aggregate_id: 'question-objective' },
            { type: 'QUESTION_ASKED', aggregate_id: 'question-objective' },
        ]);
    });

    it('answers and skips only pending questions and persists terminal states', async () => {
        const created = await workflow.create.run({ objectiveId: 'question-objective', question: 'Clarify scope?' });
        const answered = await workflow.answer.run({ questionId: created.value.id, answer: '  Include mobile.  ' });
        expect(answered.value).toMatchObject({ status: QuestionStatus.ANSWERED, answer: 'Include mobile.' });
        expect(database.prepare('SELECT type FROM events ORDER BY rowid').all()).toEqual([
            { type: 'QUESTION_ASKED' }, { type: 'QUESTION_ANSWERED' },
        ]);
        expect((await workflow.answer.run({ questionId: created.value.id, answer: 'Again' })).error.code)
            .toBe('invalid-question-transition');
        const pending = await workflow.create.run({ objectiveId: 'question-objective', question: 'Another question?' });
        expect((await workflow.skip.run({ questionId: pending.value.id })).value.status).toBe(QuestionStatus.SKIPPED);
        expect((await workflow.answer.run({ questionId: pending.value.id, answer: 'No' })).error.code)
            .toBe('invalid-question-transition');
    });

    it('returns actionable errors for missing objectives, questions, and empty answers', async () => {
        expect((await workflow.create.run({ objectiveId: 'missing', question: 'Question?' })).error.code)
            .toBe('objective-not-found');
        expect((await workflow.answer.run({ questionId: 'missing', answer: 'Answer' })).error.code)
            .toBe('question-not-found');
        const created = await workflow.create.run({ objectiveId: 'question-objective', question: 'Question?' });
        expect((await workflow.answer.run({ questionId: created.value.id, answer: ' ' })).error.code)
            .toBe('invalid-objective-answer');
    });

    it('enforces terminal transition rules and bounded question/answer text', async () => {
        expect(canTransitionQuestion('PENDING', 'ANSWERED')).toBe(true);
        expect(canTransitionQuestion('ANSWERED', 'PENDING')).toBe(false);
        expect(() => transitionQuestion({ id: 'q', objectiveId: 'o', question: '?', status: 'ANSWERED' }, 'PENDING')).toThrow();
        expect((await workflow.create.run({ objectiveId: 'question-objective', question: 'x'.repeat(2001) })).ok).toBe(false);
        const created = await workflow.create.run({ objectiveId: 'question-objective', question: 'Valid?' });
        expect((await workflow.answer.run({ questionId: created.value.id, answer: 'x'.repeat(10001) })).ok).toBe(false);
    });

    it('rolls back a question write when its durable event cannot be recorded', async () => {
        const duplicateIds = ['transaction-question-1', 'duplicate-event', 'transaction-question-2', 'duplicate-event'];
        const transactionalWorkflow = createObjectiveQuestionWorkflow({
            questionRepository: questions, objectiveRepository: objectives,
            idFactory: () => duplicateIds.shift(), eventPublisher: new SqliteEventBus(database),
            unitOfWork: createSqliteUnitOfWork(database), clock: { now: () => '2026-10-03T12:00:00.000Z' },
        });
        expect((await transactionalWorkflow.create.run({ objectiveId: 'question-objective', question: 'First?' })).ok).toBe(true);
        expect((await transactionalWorkflow.create.run({ objectiveId: 'question-objective', question: 'Second?' })).ok).toBe(false);
        expect(questions.listByObjective('question-objective')).toHaveLength(1);
        expect(database.prepare('SELECT COUNT(*) AS count FROM events').get().count).toBe(1);
    });
});
