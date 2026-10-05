/** Phase 300 — redact sensitive user text in CEO execution reports. */
import { describe, expect, it } from 'vitest';
import { createCEOExecutionReport } from '../src/application';
import { AgentRole } from '../src/constants';

describe('Phase 300 — CEO report secret filtering', () => {
    it('redacts credentials from objective titles and task blockers', async () => {
        const report = await createCEOExecutionReport({
            agentRepository: { getById: () => ({ id: 'ceo-300', role: AgentRole.CEO, organizationId: 'org-300' }) },
            objectiveRepository: { getById: () => ({ id: 'objective-300', organizationId: 'org-300', title: 'Fix api_key=title-secret', status: 'ACTIVE' }) },
            projectRepository: { listByObjective: () => [{ id: 'project-300' }] },
            taskRepository: { listByProject: () => [{ id: 'task-300', status: 'BLOCKED',
                blockerReason: 'Provider failed with https://user:blocker-secret@service.example' }] },
            auditRepository: { listByTask: () => [] }, usageRepository: { listByTask: () => [] },
        }).run({ ceoId: 'ceo-300', objectiveId: 'objective-300' });

        expect(report.ok).toBe(true);
        expect(JSON.stringify(report.value)).not.toMatch(/title-secret|blocker-secret/);
        expect(report.value.objective.title).toBe('Fix api_key=[redacted]');
        expect(report.value.blockers[0].reason).toContain('user:[redacted]@service.example');
    });
});
