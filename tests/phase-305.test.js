/** Phase 305 — enforce organization scope on CEO report authorization. */
import { describe, expect, it } from 'vitest';
import { createCEOExecutionReport } from '../src/application';
import { AgentRole } from '../src/constants';

function makeReport(objectiveOrganizationId, ceoOrganizationId = 'organization-305') {
    return createCEOExecutionReport({
        agentRepository: { getById: () => ({ id: 'ceo-305', role: AgentRole.CEO, organizationId: ceoOrganizationId }) },
        objectiveRepository: { getById: () => ({ id: 'objective-305', organizationId: objectiveOrganizationId,
            title: 'Objective', status: 'ACTIVE' }) },
        projectRepository: { listByObjective: () => [] }, taskRepository: { listByProject: () => [] },
        auditRepository: { listByTask: () => [] }, usageRepository: { listByTask: () => [] },
    });
}

describe('Phase 305 — CEO report organization boundary', () => {
    it('rejects objectives belonging to another organization', async () => {
        const result = await makeReport('organization-other').run({ ceoId: 'ceo-305', objectiveId: 'objective-305' });
        expect(result.error.code).toBe('ceo-report-forbidden');
    });

    it('fails closed when persisted CEO identity has no organization', async () => {
        const result = await makeReport('organization-305', null).run({ ceoId: 'ceo-305', objectiveId: 'objective-305' });
        expect(result.error.code).toBe('ceo-report-forbidden');
    });

    it('allows a CEO to report on its own organization objective', async () => {
        const result = await makeReport('organization-305').run({ ceoId: 'ceo-305', objectiveId: 'objective-305' });
        expect(result.ok).toBe(true);
    });
});
