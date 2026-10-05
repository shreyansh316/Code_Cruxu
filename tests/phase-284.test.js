/** Phase 284 — preserve owner type through scoped decision-memory retrieval. */
import { describe, expect, it } from 'vitest';
import { retrieveScopedMemories } from '../src/domain';

const records = [
    { id: 'decision-org', scope: 'DECISION', organizationId: 'shared-owner', title: 'Organization choice', content: 'Org record', importance: 2 },
    { id: 'decision-project', scope: 'DECISION', projectId: 'shared-owner', title: 'Project choice', content: 'Project record', importance: 2 },
    { id: 'knowledge-task', scope: 'KNOWLEDGE', taskId: 'shared-owner', title: 'Task fact', content: 'Task record', importance: 1 },
];

describe('Phase 284 — typed ownership for decision and knowledge memory', () => {
    it('does not cross organization, project, or task boundaries when identifiers collide', () => {
        expect(retrieveScopedMemories(records, { scope: 'DECISION', ownerId: 'shared-owner', ownerType: 'organizationId' })
            .map(({ memory }) => memory.id)).toEqual(['decision-org']);
        expect(retrieveScopedMemories(records, { scope: 'DECISION', ownerId: 'shared-owner', ownerType: 'projectId' })
            .map(({ memory }) => memory.id)).toEqual(['decision-project']);
        expect(retrieveScopedMemories(records, { scope: 'KNOWLEDGE', ownerId: 'shared-owner', ownerType: 'taskId' })
            .map(({ memory }) => memory.id)).toEqual(['knowledge-task']);
    });

    it('fails closed if an ambiguous memory scope omits its owner type', () => {
        for (const scope of ['DECISION', 'KNOWLEDGE']) {
            expect(() => retrieveScopedMemories(records, { scope, ownerId: 'shared-owner' }))
                .toThrow(/constraints are invalid/);
        }
    });
});
