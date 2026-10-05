/** Phase 299 — redact sensitive strings before selecting memories into AI context. */
import { describe, expect, it } from 'vitest';
import { assembleBoundedAgentContext } from '../src/application/contextAssembly';

describe('Phase 299 — memory context secret filtering', () => {
    it('redacts credentials from memory title, category, and content in the emitted packet', () => {
        const memory = { id: 'memory-299', scope: 'TASK', taskId: 'task-299',
            title: 'token=title-secret', category: 'api_key=category-secret',
            content: 'Use https://user:content-secret@service.example only for local checks.', importance: 2, verified: true };
        const context = assembleBoundedAgentContext({ memoryRepository: { listByOwner: () => [memory] }, authorize: () => true },
            { actor: { id: 'agent-299', role: 'EMPLOYEE' }, scope: 'TASK', ownerId: 'task-299' });

        expect(JSON.stringify(context)).not.toMatch(/title-secret|category-secret|content-secret/);
        expect(context.items[0]).toMatchObject({ title: 'token=[redacted]', category: 'api_key=[redacted]',
            content: 'Use https://user:[redacted]@service.example only for local checks.' });
    });
});
