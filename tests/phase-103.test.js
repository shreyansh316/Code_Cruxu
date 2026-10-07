import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { renderCommandCenterHtml } from '../src/core/commandCenterView';

describe('Phase 103 — persisted Director room', () => {
    it('presents bounded persisted questions with objective context and answered responses', () => {
        const snapshot = createCommandCenterSnapshot({
            executionStatus: 'RUNNING',
            objectives: [{ id: 'objective-secret', title: 'Build editor' }],
            tasks: [],
            directorQuestions: [
                { id: 'question-secret', objectiveId: 'objective-secret', question: 'Which platforms?', answer: '', status: 'PENDING', category: 'Scope' },
                { id: 'answered-secret', objectiveId: 'objective-secret', question: 'Which language?', answer: 'JavaScript', status: 'ANSWERED' },
                { objectiveId: 'missing-objective', question: 'Retain logs?', answer: 'Do not expose this', status: 'SKIPPED' },
            ],
        });

        expect(snapshot.directorQuestions).toEqual([
            { objectiveTitle: 'Build editor', question: 'Which platforms?', answer: '', status: 'PENDING', category: 'Scope' },
            { objectiveTitle: 'Build editor', question: 'Which language?', answer: 'JavaScript', status: 'ANSWERED', category: '' },
            { objectiveTitle: 'Objective unavailable', question: 'Retain logs?', answer: '', status: 'SKIPPED', category: '' },
        ]);
        expect(JSON.stringify(snapshot)).not.toContain('question-secret');
        expect(JSON.stringify(snapshot)).not.toContain('Do not expose this');
        expect(Object.isFrozen(snapshot.directorQuestions[0])).toBe(true);
    });

    it('renders a Director area with safe text insertion and an explicit empty state', () => {
        const html = renderCommandCenterHtml();
        expect(html).toContain('AI Director');
        expect(html).toContain('No Director questions yet.');
        expect(html).toContain('question.textContent = record.question');
        expect(html).toContain('answer.textContent = \'CEO answer: \' + record.answer');
        expect(html).not.toContain('innerHTML');
    });
});
