import { describe, expect, it, vi } from 'vitest';
import { assembleBoundedAgentContext } from '../src/application/contextAssembly';

const memories = [
    { id: 'memory-a', scope: 'TASK', taskId: 'task-a', title: 'Migration', category: 'database', content: 'Rollback is transactional.', importance: 3, verified: true },
    { id: 'memory-b', scope: 'TASK', taskId: 'task-a', title: 'Other', category: 'notes', content: 'Bounded content.', importance: 1, verified: false },
    { id: 'memory-secret', scope: 'TASK', taskId: 'task-b', title: 'Migration', category: 'database', content: 'Another task secret.', importance: 3, verified: true },
];
const actor = { id: 'employee-1', role: 'EMPLOYEE' };

describe('Phase 072 — bounded agent context assembly', () => {
    it('authorizes first, retrieves only the exact scope owner, ranks, and enforces item and byte limits', () => {
        const listByOwner = vi.fn((scope, ownerId, { limit }) => {
            expect(scope).toBe('TASK');
            expect(ownerId).toBe('task-a');
            expect(limit).toBe(8);
            return memories;
        });
        const context = assembleBoundedAgentContext({ memoryRepository: { listByOwner },
            authorize: vi.fn(() => true) }, { actor, scope: 'TASK', ownerId: 'task-a', query: 'migration', limit: 2, maxBytes: 1024 });
        expect(context.items.map(({ id }) => id)).toEqual(['memory-a', 'memory-b']);
        expect(new TextEncoder().encode(JSON.stringify(context)).byteLength).toBeLessThanOrEqual(1024);
        expect(context.items.some(({ id }) => id === 'memory-secret')).toBe(false);
    });

    it('denies unauthorized retrieval before touching memory storage', () => {
        const listByOwner = vi.fn();
        expect(() => assembleBoundedAgentContext({ memoryRepository: { listByOwner }, authorize: () => false },
            { actor, scope: 'TASK', ownerId: 'task-a' })).toThrow(/not authorized/);
        expect(listByOwner).not.toHaveBeenCalled();
    });

    it('rejects invalid limits and authorization failures without widening scope', () => {
        const listByOwner = vi.fn(() => memories);
        expect(() => assembleBoundedAgentContext({ memoryRepository: { listByOwner }, authorize: () => { throw new Error('deny'); } },
            { actor, scope: 'TASK', ownerId: 'task-a' })).toThrow(/not authorized/);
        expect(() => assembleBoundedAgentContext({ memoryRepository: { listByOwner }, authorize: () => true },
            { actor, scope: 'TASK', ownerId: 'task-a', limit: 26 })).toThrow(/limits or actor identity/);
        expect(listByOwner).not.toHaveBeenCalled();
    });

    it('authorizes decision memory by its typed owner and passes that same boundary to retrieval', () => {
        const listByOwner = vi.fn(() => [{ id: 'decision-project', scope: 'DECISION', projectId: 'shared-id',
            title: 'Project decision', content: 'Project-only decision', importance: 1, verified: true }]);
        const authorize = vi.fn(() => true);
        const context = assembleBoundedAgentContext({ memoryRepository: { listByOwner }, authorize }, {
            actor, scope: 'DECISION', ownerId: 'shared-id', ownerType: 'projectId', query: 'decision',
        });
        expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ scope: 'DECISION', ownerId: 'shared-id', ownerType: 'projectId' }));
        expect(listByOwner).toHaveBeenCalledWith('DECISION', 'shared-id', expect.objectContaining({ ownerType: 'projectId' }));
        expect(context.items.map(({ id }) => id)).toEqual(['decision-project']);
        expect(() => assembleBoundedAgentContext({ memoryRepository: { listByOwner }, authorize: () => true },
            { actor, scope: 'DECISION', ownerId: 'shared-id' })).toThrow(/limits or actor identity/);
    });
});
