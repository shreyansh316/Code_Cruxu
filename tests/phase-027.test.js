/** Phase 027 — deterministic scope-safe memory retrieval. */
import { describe, expect, it } from 'vitest';
import { MemoryScope } from '../src/constants';
import { DomainInvariantError, retrieveScopedMemories } from '../src/domain';

const memories = [
    { id: 'z-title', scope: MemoryScope.TASK, taskId: 'task-a', title: 'SQLite migration', content: 'Migration has rollback', category: 'database', importance: 1, verified: false },
    { id: 'a-title', scope: MemoryScope.TASK, taskId: 'task-a', title: 'SQLite migration', content: 'SQLite migration verified', category: 'database', importance: 2, verified: true },
    { id: 'b-content', scope: MemoryScope.TASK, taskId: 'task-a', title: 'Persistence', content: 'SQLite migration details', category: 'notes', importance: 3, verified: true },
    { id: 'foreign', scope: MemoryScope.TASK, taskId: 'task-b', title: 'SQLite migration', content: 'Foreign task', category: 'database', importance: 3, verified: true },
    { id: 'wrong-scope', scope: MemoryScope.PROJECT, projectId: 'task-a', title: 'SQLite migration', content: 'Wrong scope', category: 'database', importance: 3, verified: true },
];

describe('Phase 027 — scoped memory retrieval', () => {
    it('ranks query matches deterministically from title, category, and content', () => {
        const result = retrieveScopedMemories(memories, {
            scope: MemoryScope.TASK, ownerId: 'task-a', query: 'SQLite migration',
        });
        expect(result.map(({ memory }) => memory.id)).toEqual(['a-title', 'z-title', 'b-content']);
        expect(result.map(({ score }) => score)).toEqual([8, 7, 2]);
        expect(retrieveScopedMemories([...memories].reverse(), {
            scope: MemoryScope.TASK, ownerId: 'task-a', query: 'SQLite migration',
        }).map(({ memory }) => memory.id)).toEqual(['a-title', 'z-title', 'b-content']);
    });

    it('enforces exact scope and owner along with metadata filters and limit', () => {
        const result = retrieveScopedMemories(memories, {
            scope: MemoryScope.TASK, ownerId: 'task-a', categories: ['database'], verifiedOnly: true,
            minImportance: 2, limit: 1,
        });
        expect(result).toHaveLength(1);
        expect(result[0].memory.id).toBe('a-title');
        expect(result[0].memory.taskId).toBe('task-a');
        expect(retrieveScopedMemories(memories, {
            scope: MemoryScope.TASK, ownerId: 'missing',
        })).toEqual([]);
    });

    it('supports single-link decision and knowledge scopes without leaking another owner', () => {
        const records = [
            { id: 'decision-a', scope: MemoryScope.DECISION, objectiveId: 'owner-a', title: 'Decision', content: 'A', importance: 1 },
            { id: 'decision-b', scope: MemoryScope.DECISION, projectId: 'owner-b', title: 'Decision', content: 'B', importance: 1 },
            { id: 'invalid-dual', scope: MemoryScope.KNOWLEDGE, taskId: 'owner-a', projectId: 'owner-a', title: 'Bad', content: 'Bad', importance: 1 },
        ];
        expect(retrieveScopedMemories(records, { scope: MemoryScope.DECISION, ownerId: 'owner-a' })
            .map(({ memory }) => memory.id)).toEqual(['decision-a']);
    });

    it('rejects malformed constraints and clamps the requested result bound', () => {
        for (const options of [
            { scope: MemoryScope.TASK, ownerId: 'task-a', limit: 101 },
            { scope: MemoryScope.TASK, ownerId: 'task-a', minImportance: 4 },
            { scope: MemoryScope.TASK, ownerId: '', query: 'x' },
            { scope: MemoryScope.TASK, ownerId: 'task-a', categories: 'database' },
            { scope: MemoryScope.TASK, ownerId: 'task-a', query: 'x'.repeat(501) },
        ]) {
            expect(() => retrieveScopedMemories(memories, options)).toThrowError(DomainInvariantError);
        }
        expect(retrieveScopedMemories(memories, {
            scope: MemoryScope.TASK, ownerId: 'task-a', limit: 100,
        })).toHaveLength(3);
        expect(() => retrieveScopedMemories([
            { id: 'malformed', scope: MemoryScope.TASK, taskId: 'task-a', title: 2, content: 'x', importance: 1 },
        ], { scope: MemoryScope.TASK, ownerId: 'task-a' })).toThrowError(DomainInvariantError);
    });
});
