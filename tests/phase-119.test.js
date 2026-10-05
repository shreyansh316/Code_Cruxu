import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';

describe('Phase 119 — Office Head identity visibility', () => {
    it('links the persisted head manager by managed office and never selects an unrelated manager', () => {
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [],
            organizations: [{ id: 'org-a', name: 'A' }, { id: 'org-b', name: 'B' }],
            offices: [{ id: 'office-a', organizationId: 'org-a', name: 'A Office', status: 'ACTIVE' },
                { id: 'office-b', organizationId: 'org-b', name: 'B Office', status: 'ACTIVE' }],
            agents: [{ id: 'head-a', name: 'A Head', role: 'HEAD_MANAGER', managedOfficeId: 'office-a' },
                { id: 'head-b', name: 'B Head', role: 'HEAD_MANAGER', managedOfficeId: 'office-b' }],
        });

        expect(snapshot.workforce.map(({ organization, headManager }) => ({ organization, headManager })))
            .toEqual([{ organization: 'A', headManager: 'A Head' }, { organization: 'B', headManager: 'B Head' }]);
        expect(JSON.stringify(snapshot.workforce)).not.toContain('head-a');
    });
});
