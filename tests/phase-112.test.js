import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';

describe('Phase 112 — deterministic command-center ordering', () => {
    it('sorts persisted objectives, active tasks, errors, and questions independently of query order', () => {
        const snapshot = createCommandCenterSnapshot({
            objectives: [{ id: 'objective-z', title: 'Zulu' }, { id: 'objective-a', title: 'Alpha' }],
            tasks: [
                { id: 'task-z', title: 'Zulu task', status: 'FAILED' },
                { id: 'task-b', title: 'Beta task', status: 'IN_PROGRESS' },
                { id: 'task-a', title: 'Alpha task', status: 'BLOCKED' },
            ],
            directorQuestions: [
                { id: 'question-later', objectiveId: 'objective-a', sortOrder: 1, question: 'Later?' },
                { id: 'question-first', objectiveId: 'objective-a', sortOrder: 0, question: 'First?' },
            ],
        });

        expect(snapshot.objectives.map(({ title }) => title)).toEqual(['Alpha', 'Zulu']);
        expect(snapshot.activeTasks.map(({ title }) => title)).toEqual(['Alpha task', 'Beta task']);
        expect(snapshot.taskErrors.map(({ title }) => title)).toEqual(['Alpha task', 'Zulu task']);
        expect(snapshot.directorQuestions.map(({ question }) => question)).toEqual(['First?', 'Later?']);
    });
});
