/** Phase 357 — bounded memory retrieval can select explicit evidence classes. */
import { describe, expect, it } from 'vitest';
import { retrieveScopedMemories } from '../src/domain';

const records = [
    { id: 'test-357', scope: 'TASK', taskId: 'task-357', title: 'Test result', content: 'Suite passed.', importance: 2,
        verified: 1, sourceKind: 'TEST_RESULT', sourceReference: 'run:357', verifiedByAgentId: 'reviewer-357', verifiedAt: '2026-10-06T00:00:00.000Z' },
    { id: 'review-357', scope: 'TASK', taskId: 'task-357', title: 'Review finding', content: 'Potential issue.', importance: 3,
        verified: 0, sourceKind: 'REVIEW_FINDING' },
    { id: 'note-357', scope: 'TASK', taskId: 'task-357', title: 'User note', content: 'Local preference.', importance: 1,
        verified: 0, sourceKind: 'USER_NOTE' },
    { id: 'legacy-357', scope: 'TASK', taskId: 'task-357', title: 'Old note', content: 'Unknown origin.', importance: 3,
        verified: 1, sourceKind: 'LEGACY' },
];

describe('Phase 357 — source-aware memory retrieval', () => {
    it('filters source classes independently from verification and importance ranking', () => {
        const review = retrieveScopedMemories(records, { scope: 'TASK', ownerId: 'task-357', sourceKinds: ['REVIEW_FINDING'] });
        expect(review.map(({ memory }) => memory.id)).toEqual(['review-357']);
        const verified = retrieveScopedMemories(records, { scope: 'TASK', ownerId: 'task-357', verifiedOnly: true });
        expect(verified.map(({ memory }) => memory.id)).toEqual(['test-357']);
        const findingsAndTests = retrieveScopedMemories(records, { scope: 'TASK', ownerId: 'task-357',
            sourceKinds: ['REVIEW_FINDING', 'TEST_RESULT'] });
        expect(findingsAndTests.map(({ memory }) => memory.id)).toEqual(['review-357', 'test-357']);
    });

    it('rejects unknown, duplicate, or empty source filters', () => {
        for (const sourceKinds of [[], ['OTHER'], ['TEST_RESULT', 'TEST_RESULT']]) {
            expect(() => retrieveScopedMemories(records, { scope: 'TASK', ownerId: 'task-357', sourceKinds }))
                .toThrow(/constraints are invalid/);
        }
    });
});
